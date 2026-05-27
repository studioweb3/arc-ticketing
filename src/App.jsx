import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';

// --- CONFIGURATION ARC TICKETING ---
const FACTORY_ADDRESS = "0x4d6c0DcB5c2aA3270e061Ab549B378fFaAA9A776"; 

// Configuration du réseau ARC Testnet pour MetaMask
const TARGET_CHAIN_ID = "0x4cef52"; 
const TARGET_NETWORK_CONFIG = {
    chainId: TARGET_CHAIN_ID,
    chainName: 'ARC Testnet',
    nativeCurrency: {
        name: 'USDC',
        symbol: 'USDC', 
        decimals: 18
    },
    rpcUrls: ['https://rpc.testnet.arc.network'],
    blockExplorerUrls: ['https://testnet.arcscan.app']
};

const factoryABI = [
    "function createNewEvent(string _eventName, string _flyerUrl, uint256 _price, uint256 _markup, uint256 _royalty, uint256 _eventStart, uint256 _deadline, uint256 _maxSeats) external",
    "function getEventsByOrganizer(address _organizer) view returns (address[])",
    "function getAllEvents() view returns (tuple(address eventAddress, string eventName, string flyerUrl, uint256 eventStart)[])"
];

const ticketEventABI = [
    "function eventName() view returns (string)",
    "function flyerUrl() view returns (string)",
    "function eventStart() view returns (uint256)",
    "function ticketPrice() view returns (uint256)",
    "function maxMarkupPercent() view returns (uint256)",
    "function royaltyPercent() view returns (uint256)",
    "function refundDeadline() view returns (uint256)",
    "function maxSeats() view returns (uint256)",
    "function isCancelled() view returns (bool)", 
    "function isMinted(uint256) view returns (bool)",
    "function isAvailableInTreasury(uint256) view returns (bool)",
    "function ownerOf(uint256 tokenId) view returns (address)",
    "function resaleListings(uint256) view returns (uint256 price, bool isListed)",
    "function offers(uint256) view returns (address bidder, uint256 offeredTicketId, uint256 usdcAmount, bool active)",
    "function updateMaxMarkup(uint256 newMarkup) external",
    "function updateRoyalty(uint256 newRoyalty) external",
    "function setRefundDeadline(uint256 newDeadlineTimestamp) external",
    "function cancelEvent() external", 
    "function buyTicket(uint256 seatId) external payable",
    "function refundTicket(uint256 seatId) external", 
    "function listForResale(uint256 seatId, uint256 price) external",
    "function buyResaleTicket(uint256 seatId) external payable",
    "function cancelResale(uint256 seatId) external",
    "function makeOffer(uint256 targetSeatId, uint256 mySeatId) external payable",
    "function acceptOffer(uint256 mySeatId) external",
    "function cancelOffer(uint256 targetSeatId) external"
];

const getTomorrowLocalISO = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isoString = new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60000).toISOString();
    return isoString.substring(0, 16); 
};

export default function App() {
    const [provider, setProvider] = useState(null);
    const [signer, setSigner] = useState(null);
    const [userAddress, setUserAddress] = useState("");
    
    const [activeTab, setActiveTab] = useState(""); // Vide au départ pour forcer l'accueil
    const [status, setStatus] = useState({ text: "", isError: false });
    const [seatActionStatus, setSeatActionStatus] = useState({ text: "", isError: false }); 
    
    const [myEvents, setMyEvents] = useState([]);
    const [allAvailableEvents, setAllAvailableEvents] = useState([]);
    const [hiddenEvents, setHiddenEvents] = useState([]);
    const [showHiddenEvents, setShowHiddenEvents] = useState(false);

    const [isCreatingNew, setIsCreatingNew] = useState(true);

    const [selectedEvent, setSelectedEvent] = useState(null);
    const [eventDetails, setEventDetails] = useState({ name: "", flyer: "", start: "", startUnix: 0, price: "0", markup: "0", royalty: "0", deadline: "", maxSeats: "0", deadlineUnix: 0, isCancelled: false });
    
    const [eventName, setEventName] = useState("");
    const [flyerUrl, setFlyerUrl] = useState("https://images.unsplash.com/photo-1540039155732-68473638e4ce?w=800&q=80"); 
    const [startDate, setStartDate] = useState(getTomorrowLocalISO());
    const [ticketPrice, setTicketPrice] = useState("10");
    const [maxMarkup, setMaxMarkup] = useState("20");
    const [royalty, setRoyalty] = useState("5");
    const [deadlineDate, setDeadlineDate] = useState(getTomorrowLocalISO());
    const [formSeats, setFormSeats] = useState("50"); 
    
    const [modifMarkup, setModifMarkup] = useState("");
    const [modifRoyalty, setModifRoyalty] = useState("");
    const [modifDeadlineDate, setModifDeadlineDate] = useState(getTomorrowLocalISO());

    const [targetEvent, setTargetEvent] = useState(null); 
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [selectedSeat, setSelectedSeat] = useState(null);
    
    const [takenSeats, setTakenSeats] = useState([]);
    const [myOwnedSeats, setMyOwnedSeats] = useState([]);
    const [resaleListings, setResaleListings] = useState({}); 
    const [activeOffers, setActiveOffers] = useState({});     
    
    const [resalePriceInput, setResalePriceInput] = useState(""); 
    const [offerSeatInput, setOfferSeatInput] = useState("0"); 
    const [offerUsdcInput, setOfferUsdcInput] = useState("");

    const [currentEventTotalSeats, setCurrentEventTotalSeats] = useState(0); 
    const [currentEventPrice, setCurrentEventPrice] = useState("0"); 
    const [currentEventRefundDeadline, setCurrentEventRefundDeadline] = useState(0);
    const [currentEventIsCancelled, setCurrentEventIsCancelled] = useState(false);

    const [showQRModal, setShowQRModal] = useState(false);

    const seatsPerRow = 10; 

    useEffect(() => {
        if (window.ethereum) {
            window.ethereum.on('accountsChanged', () => window.location.reload());
            window.ethereum.on('chainChanged', () => window.location.reload());
        }
        const savedHidden = JSON.parse(localStorage.getItem('hiddenArcEvents')) || [];
        setHiddenEvents(savedHidden);
    }, []);

    const showStatus = (text, isError) => {
        setStatus({ text, isError });
        setTimeout(() => setStatus({ text: "", isError: false }), 5000);
    };

    const showSeatStatus = (text, isError) => {
        setSeatActionStatus({ text, isError });
        setTimeout(() => setSeatActionStatus({ text: "", isError: false }), 6000);
    };

    const formatAddress = (addr) => {
        if (!addr) return "";
        return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
    };

    const refreshSpectatorGrid = () => {
        const currentTarget = targetEvent;
        setTargetEvent(null); 
        setTimeout(() => setTargetEvent(currentTarget), 100);
    };

    const checkAndSwitchNetwork = async () => {
        if (!window.ethereum) return false;
        try {
            const currentChainId = await window.ethereum.request({ method: 'eth_chainId' });
            if (currentChainId !== TARGET_CHAIN_ID) {
                try {
                    await window.ethereum.request({
                        method: 'wallet_switchEthereumChain',
                        params: [{ chainId: TARGET_CHAIN_ID }],
                    });
                    return true;
                } catch (switchError) {
                    if (switchError.code === 4902) {
                        try {
                            await window.ethereum.request({
                                method: 'wallet_addEthereumChain',
                                params: [TARGET_NETWORK_CONFIG],
                            });
                            return true;
                        } catch (addError) {
                            showStatus("Veuillez ajouter le réseau ARC à MetaMask.", true);
                            return false;
                        }
                    } else {
                        showStatus("Vous devez être sur le réseau ARC Testnet.", true);
                        return false;
                    }
                }
            }
            return true;
        } catch (error) {
            console.error("Erreur de réseau", error);
            return false;
        }
    };

    const connectWallet = async (initialTab) => {
        if (window.ethereum) {
            try {
                setActiveTab(initialTab); 

                const isCorrectNetwork = await checkAndSwitchNetwork();
                if (!isCorrectNetwork) {
                    setActiveTab(""); 
                    return;
                }

                const browserProvider = new ethers.BrowserProvider(window.ethereum);
                const ethSigner = await browserProvider.getSigner();
                setProvider(browserProvider);
                setSigner(ethSigner);
                const address = await ethSigner.getAddress();
                setUserAddress(address);
                loadOrganizerEvents(address, browserProvider);
                loadGlobalEvents(browserProvider);
            } catch (err) { 
                showStatus("Erreur de connexion", true); 
                setActiveTab(""); 
            }
        } else { showStatus("Veuillez installer MetaMask", true); }
    };

    const disconnectWallet = () => {
        setSigner(null); setProvider(null); setUserAddress("");
        setMyEvents([]); setSelectedEvent(null); setTargetEvent(null);
        setActiveTab(""); 
    };

    const hideEvent = (eventAddress, e) => {
        e.stopPropagation();
        const updatedHidden = [...hiddenEvents, eventAddress];
        setHiddenEvents(updatedHidden);
        localStorage.setItem('hiddenArcEvents', JSON.stringify(updatedHidden));
        if (selectedEvent === eventAddress) {
            setSelectedEvent(null);
            setIsCreatingNew(true); 
        }
    };

    const restoreEvent = (eventAddress, e) => {
        e.stopPropagation();
        const updatedHidden = hiddenEvents.filter(addr => addr !== eventAddress);
        setHiddenEvents(updatedHidden);
        localStorage.setItem('hiddenArcEvents', JSON.stringify(updatedHidden));
        if (updatedHidden.length === 0) setShowHiddenEvents(false);
    };

    const loadOrganizerEvents = async (address, currentProvider) => {
        try {
            const factory = new ethers.Contract(FACTORY_ADDRESS, factoryABI, currentProvider);
            const events = await factory.getEventsByOrganizer(address);
            setMyEvents(events);
        } catch (err) { console.error(err); }
    };

    const loadGlobalEvents = async (currentProvider) => {
        try {
            const factory = new ethers.Contract(FACTORY_ADDRESS, factoryABI, currentProvider);
            const allEvents = await factory.getAllEvents();
            setAllAvailableEvents(allEvents);
        } catch (err) { console.error(err); }
    };

    const selectEventForManagement = async (eventAddress) => {
        if (!provider) return;
        try {
            showStatus("Lecture des données...", false);
            setIsCreatingNew(false); 
            
            const eventContract = new ethers.Contract(eventAddress, ticketEventABI, provider);
            
            const name = await eventContract.eventName();
            const flyer = await eventContract.flyerUrl();
            const start = await eventContract.eventStart();
            const price = await eventContract.ticketPrice();
            const markup = await eventContract.maxMarkupPercent();
            const roy = await eventContract.royaltyPercent();
            const dead = await eventContract.refundDeadline();
            const seats = await eventContract.maxSeats();
            const isCancelled = await eventContract.isCancelled();
            
            const dateOptions = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' };
            const startFormatted = new Date(Number(start) * 1000).toLocaleString('fr-FR', dateOptions);
            const deadlineFormatted = Number(dead) === 0 ? "Désactivé" : new Date(Number(dead) * 1000).toLocaleString('fr-FR', dateOptions);

            setEventDetails({
                name, flyer, start: startFormatted, startUnix: Number(start),
                price: ethers.formatEther(price),
                markup: markup.toString(),
                royalty: roy.toString(),
                deadline: deadlineFormatted,
                deadlineUnix: Number(dead),
                maxSeats: seats.toString(),
                isCancelled
            });
            setSelectedEvent(eventAddress);
            showStatus("Contrat chargé !", false);
        } catch (err) { showStatus("Erreur lors de la lecture", true); }
    };

    const handleCreateEvent = async (e) => {
        e.preventDefault();
        try {
            showStatus("Création en cours (veuillez signer)...", false);
            const factory = new ethers.Contract(FACTORY_ADDRESS, factoryABI, signer);
            const priceInUnits = ethers.parseEther(ticketPrice);
            
            const unixStart = Math.floor(new Date(startDate).getTime() / 1000);
            const unixDeadline = Math.floor(new Date(deadlineDate).getTime() / 1000);
            
            const tx = await factory.createNewEvent(eventName, flyerUrl, priceInUnits, maxMarkup, royalty, unixStart, unixDeadline, formSeats);
            await tx.wait();
            
            showStatus("✅ Événement créé !", false);
            loadOrganizerEvents(userAddress, provider);
            loadGlobalEvents(provider);
            setEventName(""); 
            setSelectedEvent(null);
        } catch (err) { showStatus("❌ Échec de la création", true); }
    };

    const handleUpdateMarkup = async (e) => {
        e.preventDefault();
        try {
            const contract = new ethers.Contract(selectedEvent, ticketEventABI, signer);
            const tx = await contract.updateMaxMarkup(modifMarkup);
            await tx.wait();
            showStatus("✅ Plafond modifié !", false);
            selectEventForManagement(selectedEvent);
        } catch (err) { showStatus("❌ Échec", true); }
    };

    const handleUpdateRoyalty = async (e) => {
        e.preventDefault();
        try {
            const contract = new ethers.Contract(selectedEvent, ticketEventABI, signer);
            const tx = await contract.updateRoyalty(modifRoyalty);
            await tx.wait();
            showStatus("✅ Royalties modifiées !", false);
            selectEventForManagement(selectedEvent);
        } catch (err) { showStatus("❌ Échec", true); }
    };

    const handleUpdateDeadline = async (e) => {
        e.preventDefault();
        try {
            const contract = new ethers.Contract(selectedEvent, ticketEventABI, signer);
            const unixTimestamp = Math.floor(new Date(modifDeadlineDate).getTime() / 1000);
            const tx = await contract.setRefundDeadline(unixTimestamp);
            await tx.wait();
            showStatus("✅ Date modifiée !", false);
            selectEventForManagement(selectedEvent);
        } catch (err) { showStatus("❌ Échec", true); }
    };

    const handleDisableRefunds = async () => {
        try {
            const contract = new ethers.Contract(selectedEvent, ticketEventABI, signer);
            const tx = await contract.setRefundDeadline(0);
            await tx.wait();
            showStatus("🚫 Remboursements désactivés !", false);
            selectEventForManagement(selectedEvent);
        } catch (err) { showStatus("❌ Échec", true); }
    };

    const handleCancelEvent = async () => {
        try {
            const now = Math.floor(Date.now() / 1000);
            if (now >= eventDetails.startUnix) {
                return showStatus("❌ Impossible : Le spectacle a déjà commencé.", true);
            }

            if (!window.confirm("⚠️ ATTENTION : Êtes-vous sûr de vouloir annuler ce spectacle ?\n\n- Cette action est irréversible.\n- Le remboursement automatique sera ouvert à tous les spectateurs possédant un billet.")) return;
            
            showStatus("Annulation en cours...", false);
            const contract = new ethers.Contract(selectedEvent, ticketEventABI, signer);
            const tx = await contract.cancelEvent();
            await tx.wait();
            
            showStatus("🚨 Événement annulé avec succès !", false);
            selectEventForManagement(selectedEvent);
        } catch (err) { showStatus("❌ Échec de l'annulation", true); console.error(err); }
    };

    const getSeatIdNumber = (seatStr) => {
        if (!seatStr || seatStr === "0") return 0;
        const rowIndex = seatStr.charCodeAt(0) - 65; 
        const seatNum = parseInt(seatStr.slice(1));
        return (rowIndex * seatsPerRow) + seatNum;
    };

    const getSeatString = (num) => {
        if (num === 0) return "0";
        const rowChar = String.fromCharCode(65 + Math.floor((num - 1) / seatsPerRow));
        const col = ((num - 1) % seatsPerRow) + 1;
        return `${rowChar}${col}`;
    };

    const fetchSeatsAndData = useCallback(async (isBackgroundUpdate = false) => {
        if (targetEvent && provider && userAddress) {
            try {
                const contract = new ethers.Contract(targetEvent.eventAddress, ticketEventABI, provider);
                
                if (!isBackgroundUpdate) {
                    const rawPrice = await contract.ticketPrice();
                    setCurrentEventPrice(ethers.formatEther(rawPrice));

                    const deadline = await contract.refundDeadline();
                    setCurrentEventRefundDeadline(Number(deadline));

                    const cancelled = await contract.isCancelled();
                    setCurrentEventIsCancelled(cancelled);

                    const totalSeatsFromBlockchain = Number(await contract.maxSeats());
                    setCurrentEventTotalSeats(totalSeatsFromBlockchain);
                }

                const totalSeats = currentEventTotalSeats > 0 ? currentEventTotalSeats : Number(await contract.maxSeats());

                const promises = [];
                for(let i = 1; i <= totalSeats; i++) {
                    promises.push((async () => {
                        const minted = await contract.isMinted(i);
                        const inTreasury = await contract.isAvailableInTreasury(i);
                        let owner = null;
                        let resaleData = null;
                        let offerData = null;

                        if (minted && !inTreasury) {
                            owner = await contract.ownerOf(i);
                            resaleData = await contract.resaleListings(i);
                            offerData = await contract.offers(i);
                        }

                        return {
                            id: i,
                            taken: minted && !inTreasury,
                            owner: owner,
                            resaleListed: resaleData ? resaleData.isListed : false,
                            resalePrice: resaleData && resaleData.isListed ? ethers.formatEther(resaleData.price) : "0",
                            offer: offerData && offerData.active ? offerData : null
                        };
                    })());
                }
                
                const results = await Promise.all(promises);
                const newTaken = [];
                const newOwned = [];
                const newResale = {};
                const newOffers = {};

                results.forEach(r => {
                    const seatIdStr = getSeatString(r.id);

                    if (r.taken) newTaken.push(seatIdStr);
                    if (r.owner && r.owner.toLowerCase() === userAddress.toLowerCase()) newOwned.push(seatIdStr);
                    if (r.resaleListed) newResale[seatIdStr] = r.resalePrice;
                    if (r.offer) {
                        newOffers[seatIdStr] = {
                            bidder: r.offer.bidder,
                            offeredTicketStr: r.offer.offeredTicketId > 0 ? getSeatString(Number(r.offer.offeredTicketId)) : "Aucun",
                            usdcAmount: ethers.formatEther(r.offer.usdcAmount)
                        };
                    }
                });

                setTakenSeats(newTaken);
                setMyOwnedSeats(newOwned);
                setResaleListings(newResale);
                setActiveOffers(newOffers);
                
            } catch (error) { console.error(error); }
        } else {
            setTakenSeats([]); setMyOwnedSeats([]); setResaleListings({}); setActiveOffers({});
            setCurrentEventTotalSeats(0); setCurrentEventPrice("0"); setCurrentEventRefundDeadline(0); setCurrentEventIsCancelled(false);
        }
    }, [targetEvent, provider, userAddress, currentEventTotalSeats]);

    useEffect(() => {
        fetchSeatsAndData(false); 
        
        if (targetEvent) {
            const intervalId = setInterval(() => {
                fetchSeatsAndData(true); 
            }, 5000);
            
            return () => clearInterval(intervalId); 
        }
    }, [targetEvent, fetchSeatsAndData]);

    const handleBuyTicket = async () => {
        if (!targetEvent) return;
        try {
            showSeatStatus("Transaction en cours...", false);
            const eventContract = new ethers.Contract(targetEvent.eventAddress, ticketEventABI, signer);
            
            const rawPrice = ethers.parseEther(currentEventPrice);
            const buyTx = await eventContract.buyTicket(getSeatIdNumber(selectedSeat), { value: rawPrice });
            
            setTakenSeats(prev => [...prev, selectedSeat]);
            setMyOwnedSeats(prev => [...prev, selectedSeat]);
            
            await buyTx.wait();

            showSeatStatus("Acheté avec succès !", false);
            setSelectedSeat(null);
            fetchSeatsAndData(true); 
        } catch (err) { showSeatStatus("Échec de la transaction (Fonds insuffisants ou annulé)", true); }
    };

    const handleRefundTicket = async () => {
        try {
            showSeatStatus("Demande de remboursement en cours...", false);
            const eventContract = new ethers.Contract(targetEvent.eventAddress, ticketEventABI, signer);
            const numericalSeatId = getSeatIdNumber(selectedSeat);
            
            setTakenSeats(prev => prev.filter(s => s !== selectedSeat));
            setMyOwnedSeats(prev => prev.filter(s => s !== selectedSeat));

            const tx = await eventContract.refundTicket(numericalSeatId);
            await tx.wait();
            
            showSeatStatus("Billet remboursé ! L'argent est de retour.", false);
            setSelectedSeat(null);
            fetchSeatsAndData(true);
        } catch (err) { showSeatStatus("Échec du remboursement", true); }
    };

    const handleListForResale = async () => {
        try {
            if (!resalePriceInput || Number(resalePriceInput) <= 0) return showSeatStatus("Entrez un prix valide", true);
            showSeatStatus("Mise en vente sur le marché secondaire...", false);
            const eventContract = new ethers.Contract(targetEvent.eventAddress, ticketEventABI, signer);
            const numericalSeatId = getSeatIdNumber(selectedSeat);
            const priceInUnits = ethers.parseEther(resalePriceInput);
            
            setResaleListings(prev => ({...prev, [selectedSeat]: resalePriceInput}));

            const tx = await eventContract.listForResale(numericalSeatId, priceInUnits);
            await tx.wait();
            
            showSeatStatus("Place mise en revente !", false);
            setResalePriceInput("");
            setSelectedSeat(null);
            fetchSeatsAndData(true);
        } catch (err) { showSeatStatus("Échec de la mise en vente (Plafond dépassé)", true); }
    };

    const handleCancelResale = async () => {
        try {
            showSeatStatus("Annulation de la vente...", false);
            const eventContract = new ethers.Contract(targetEvent.eventAddress, ticketEventABI, signer);
            const numericalSeatId = getSeatIdNumber(selectedSeat);
            
            setResaleListings(prev => { const n = {...prev}; delete n[selectedSeat]; return n; });

            const tx = await eventContract.cancelResale(numericalSeatId);
            await tx.wait();
            
            showSeatStatus("Vente annulée !", false);
            setSelectedSeat(null);
            fetchSeatsAndData(true);
        } catch (err) { showSeatStatus("Échec de l'annulation", true); }
    };

    const handleBuyResaleTicket = async () => {
        try {
            showSeatStatus("Achat sur le marché secondaire...", false);
            const eventContract = new ethers.Contract(targetEvent.eventAddress, ticketEventABI, signer);
            
            const priceStr = resaleListings[selectedSeat];
            const rawPrice = ethers.parseEther(priceStr);
            
            setMyOwnedSeats(prev => [...prev, selectedSeat]);
            setResaleListings(prev => { const n = {...prev}; delete n[selectedSeat]; return n; });

            const buyTx = await eventContract.buyResaleTicket(getSeatIdNumber(selectedSeat), { value: rawPrice });
            await buyTx.wait();

            showSeatStatus("Billet de revente acheté !", false);
            setSelectedSeat(null);
            fetchSeatsAndData(true);
        } catch (err) { showSeatStatus("Échec de l'achat (Fonds insuffisants ?)", true); }
    };

    const handleMakeOffer = async () => {
        try {
            if (offerSeatInput === "0" && (!offerUsdcInput || Number(offerUsdcInput) === 0)) {
                return showSeatStatus("Votre offre ne peut pas être vide", true);
            }

            showSeatStatus("Envoi de l'offre (Mise sous séquestre)...", false);
            const eventContract = new ethers.Contract(targetEvent.eventAddress, ticketEventABI, signer);
            
            const extraUsdcRaw = ethers.parseEther(offerUsdcInput || "0");
            const targetIdNum = getSeatIdNumber(selectedSeat);
            const mySeatIdNum = getSeatIdNumber(offerSeatInput);
            
            const tx = await eventContract.makeOffer(targetIdNum, mySeatIdNum, { value: extraUsdcRaw });
            await tx.wait();

            setActiveOffers(prev => ({
                ...prev,
                [selectedSeat]: {
                    bidder: userAddress,
                    offeredTicketStr: offerSeatInput === "0" ? "Aucun" : offerSeatInput,
                    usdcAmount: offerUsdcInput || "0"
                }
            }));

            showSeatStatus("Offre envoyée avec succès !", false);
            setSelectedSeat(null);
            setOfferUsdcInput("");
            fetchSeatsAndData(true);
        } catch (err) { showSeatStatus("Échec (Fonds insuffisants, offre invalide ou refusée)", true); console.error(err); }
    };

    const handleAcceptOffer = async () => {
        try {
            showSeatStatus("Acceptation de l'offre...", false);
            const eventContract = new ethers.Contract(targetEvent.eventAddress, ticketEventABI, signer);
            const numericalSeatId = getSeatIdNumber(selectedSeat);
            
            const tx = await eventContract.acceptOffer(numericalSeatId);
            await tx.wait();

            showSeatStatus("Échange/Vente validé !", false);
            setSelectedSeat(null);
            fetchSeatsAndData(true);
        } catch (err) { showSeatStatus("Échec de l'échange", true); }
    };

    const totalRowsNeeded = Math.ceil(currentEventTotalSeats / seatsPerRow);
    const generatedRowsArray = Array.from({ length: totalRowsNeeded }, (_, i) => String.fromCharCode(65 + i));

    const mySeatsWithOffers = myOwnedSeats.filter(seat => activeOffers[seat]);

    const displayEvents = showHiddenEvents 
        ? myEvents.filter(evt => hiddenEvents.includes(evt)) 
        : myEvents.filter(evt => !hiddenEvents.includes(evt));

    // --- PAGE D'ACCUEIL ---
    if (!activeTab || !signer) {
        return (
            <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 relative overflow-hidden">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-violet-600/20 rounded-full blur-[100px] pointer-events-none"></div>
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-sky-600/20 rounded-full blur-[100px] pointer-events-none"></div>

                <div className="text-center mb-12 z-10">
                    <span className="text-6xl mb-6 block">🎟️</span>
                    <h1 className="text-5xl md:text-6xl font-black bg-gradient-to-r from-violet-400 to-sky-400 bg-clip-text text-transparent tracking-widest mb-4 drop-shadow-lg">ARC TICKET</h1>
                    <p className="text-slate-400 font-mono uppercase tracking-[0.2em] text-sm md:text-base">La Billetterie Nouvelle Génération</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-3xl z-10">
                    <button 
                        onClick={() => connectWallet('spectator')}
                        className="bg-slate-900/80 backdrop-blur-md border-2 border-slate-800 hover:border-sky-500 p-8 rounded-3xl flex flex-col items-center text-center transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(14,165,233,0.3)] group"
                    >
                        <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mb-6 group-hover:bg-sky-900/50 transition-colors">
                            <span className="text-4xl">👀</span>
                        </div>
                        <h2 className="text-2xl font-bold text-sky-400 mb-3">Espace Spectateur</h2>
                        <p className="text-slate-400 text-sm mb-8 px-4 leading-relaxed">Achetez, revendez et échangez vos billets de spectacles en toute sécurité. Le marché secondaire enfin équitable.</p>
                        <div className="bg-sky-600 group-hover:bg-sky-500 text-white text-xs font-bold py-3 px-8 rounded-full transition-colors w-full uppercase tracking-wider">
                            Connexion Web3
                        </div>
                    </button>

                    <button 
                        onClick={() => connectWallet('organizer')}
                        className="bg-slate-900/80 backdrop-blur-md border-2 border-slate-800 hover:border-violet-500 p-8 rounded-3xl flex flex-col items-center text-center transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(139,92,246,0.3)] group"
                    >
                        <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mb-6 group-hover:bg-violet-900/50 transition-colors">
                            <span className="text-4xl">🎭</span>
                        </div>
                        <h2 className="text-2xl font-bold text-violet-400 mb-3">Espace Organisateur</h2>
                        <p className="text-slate-400 text-sm mb-8 px-4 leading-relaxed">Créez vos événements, maîtrisez vos jauges et collectez des royalties automatiques sur chaque revente.</p>
                        <div className="bg-violet-600 group-hover:bg-violet-500 text-white text-xs font-bold py-3 px-8 rounded-full transition-colors w-full uppercase tracking-wider">
                            Connexion Web3
                        </div>
                    </button>
                </div>

                {status.text && (
                    <div className="mt-8 z-10 animate-fade-in">
                        <p className="text-xs font-mono text-red-400 bg-red-900/20 px-6 py-3 rounded-xl border border-red-800/50 flex items-center gap-2">
                            <span>⚠️</span> {status.text}
                        </p>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center p-6 pb-24 relative">
            
            {showQRModal && selectedSeat && targetEvent && (
                <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-fade-in">
                    <div className="bg-white p-8 rounded-3xl shadow-2xl flex flex-col items-center max-w-sm w-full relative">
                        <button onClick={() => setShowQRModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-900 text-xl font-bold">&times;</button>
                        <h2 className="text-slate-900 font-bold text-xl mb-1">{targetEvent.eventName}</h2>
                        <p className="text-violet-600 font-black text-3xl mb-6">SIÈGE {selectedSeat}</p>
                        
                        <div className="border-4 border-slate-100 rounded-xl p-2 mb-6">
                            <img 
                                src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(JSON.stringify({
                                    contract: targetEvent.eventAddress,
                                    seat: selectedSeat,
                                    owner: userAddress
                                }))}`} 
                                alt="QR Code Billet" 
                                className="w-48 h-48"
                            />
                        </div>
                        
                        <p className="text-slate-500 text-[10px] font-mono text-center w-full bg-slate-50 p-2 rounded-lg border border-slate-200">
                            {formatAddress(userAddress)}
                        </p>
                    </div>
                </div>
            )}

            <div className="w-full max-w-5xl grid grid-cols-1 gap-6">
                
                <header className="flex justify-between items-center border-b border-slate-800 pb-4">
                    <div className="flex items-center gap-6">
                        <h1 className="text-xl font-bold text-violet-400 flex items-center gap-2">🎟️ ARC TICKET</h1>
                        <div className="bg-slate-900 p-1.5 px-4 rounded-lg border border-slate-800">
                            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                                {activeTab === 'spectator' ? '👁️ ESPACE SPECTATEUR' : '🎭 ESPACE ORGANISATEUR'}
                            </span>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-3 bg-slate-900 border border-slate-700 px-3 py-1.5 rounded-lg shadow-inner">
                            <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1.5">
                                <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span></span> ARC Network
                            </span>
                            <span className="text-slate-300 font-mono text-xs border-l border-slate-700 pl-3 ml-1 py-0.5">{formatAddress(userAddress)}</span>
                        </div>
                        <button onClick={disconnectWallet} title="Se déconnecter / Changer d'espace" className="bg-slate-900 border border-slate-800 text-slate-500 p-2 rounded-lg transition hover:bg-red-900/30 hover:text-red-400">
                            🚪
                        </button>
                    </div>
                </header>

                {status.text && (
                    <div className="text-center text-sm font-mono p-3 bg-slate-900 border border-slate-800 rounded-xl">
                        <span className={status.isError ? 'text-red-400' : 'text-emerald-400'}>{status.text}</span>
                    </div>
                )}

                {/* --- ORGANISATEUR --- */}
                {activeTab === 'organizer' && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
                        <div className="lg:col-span-1 flex flex-col gap-6">
                            
                            {isCreatingNew ? (
                                <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-lg animate-fade-in relative">
                                    {selectedEvent && (
                                        <button 
                                            onClick={() => setIsCreatingNew(false)} 
                                            className="absolute top-4 right-4 text-slate-500 hover:text-slate-300"
                                        >
                                            ✖
                                        </button>
                                    )}
                                    <h3 className="text-xs font-bold text-violet-400 mb-4 uppercase tracking-wider">Créer un Événement</h3>
                                    <form onSubmit={handleCreateEvent} className="flex flex-col gap-3">
                                        <div>
                                            <label className="text-[9px] text-slate-500 uppercase font-bold">Nom de l'événement</label>
                                            <input type="text" value={eventName} onChange={(e) => setEventName(e.target.value)} placeholder="Ex: Concert Rock" className="w-full mt-1 bg-slate-950 border border-slate-800 px-3 py-2 rounded-xl text-xs outline-none focus:border-violet-500 text-slate-200" required />
                                        </div>
                                        <div>
                                            <label className="text-[9px] text-slate-500 uppercase font-bold">URL du Flyer (Image)</label>
                                            <input type="url" value={flyerUrl} onChange={(e) => setFlyerUrl(e.target.value)} placeholder="https://lien.jpg" className="w-full mt-1 bg-slate-950 border border-slate-800 px-3 py-2 rounded-xl text-xs outline-none focus:border-violet-500 text-slate-200" required />
                                        </div>
                                        <div className="grid grid-cols-1 gap-3">
                                            <div>
                                                <label className="text-[9px] text-slate-500 uppercase font-bold">Début du spectacle</label>
                                                <input type="datetime-local" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full mt-1 bg-slate-950 border border-slate-800 px-3 py-2 rounded-xl text-xs outline-none focus:border-violet-500 text-sky-300" required />
                                            </div>
                                            <div>
                                                <label className="text-[9px] text-slate-500 uppercase font-bold">Fin Remboursement</label>
                                                <input type="datetime-local" value={deadlineDate} onChange={(e) => setDeadlineDate(e.target.value)} className="w-full mt-1 bg-slate-950 border border-slate-800 px-3 py-2 rounded-xl text-xs outline-none focus:border-violet-500 text-orange-300" required />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="text-[9px] text-slate-500 uppercase font-bold">Places</label>
                                                <input type="number" value={formSeats} onChange={(e) => setFormSeats(e.target.value)} className="w-full mt-1 bg-slate-950 border border-slate-800 px-3 py-2 rounded-xl text-xs outline-none focus:border-violet-500 font-mono text-violet-400" required />
                                            </div>
                                            <div>
                                                <label className="text-[9px] text-slate-500 uppercase font-bold">Prix (USDC)</label>
                                                <input type="number" value={ticketPrice} onChange={(e) => setTicketPrice(e.target.value)} className="w-full mt-1 bg-slate-950 border border-slate-800 px-3 py-2 rounded-xl text-xs outline-none focus:border-violet-500 font-mono" required />
                                            </div>
                                            <div>
                                                <label className="text-[9px] text-slate-500 uppercase font-bold">Plafond Anti-Scalping (%)</label>
                                                <input type="number" value={maxMarkup} onChange={(e) => setMaxMarkup(e.target.value)} className="w-full mt-1 bg-slate-950 border border-slate-800 px-3 py-2 rounded-xl text-xs outline-none focus:border-violet-500 font-mono" required />
                                            </div>
                                            <div>
                                                <label className="text-[9px] text-slate-500 uppercase font-bold">Royalties (%)</label>
                                                <input type="number" value={royalty} onChange={(e) => setRoyalty(e.target.value)} className="w-full mt-1 bg-slate-950 border border-slate-800 px-3 py-2 rounded-xl text-xs outline-none focus:border-violet-500 font-mono text-orange-400" required />
                                            </div>
                                        </div>
                                        <button type="submit" className="mt-2 bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold py-2.5 rounded-xl transition">DÉPLOYER SUR LA BLOCKCHAIN</button>
                                    </form>
                                </div>
                            ) : (
                                <button 
                                    onClick={() => {
                                        setIsCreatingNew(true);
                                        setSelectedEvent(null);
                                    }} 
                                    className="bg-slate-900 border border-slate-800 hover:border-violet-500 p-5 rounded-2xl shadow-lg flex items-center justify-center gap-2 text-violet-400 font-bold text-xs transition animate-fade-in"
                                >
                                    <span>➕</span> CRÉER UN NOUVEL ÉVÉNEMENT
                                </button>
                            )}
                            
                            <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-lg flex-1">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                                        {showHiddenEvents ? "Corbeille" : "Mes Événements"}
                                    </h3>
                                    {hiddenEvents.length > 0 && (
                                        <button onClick={() => setShowHiddenEvents(!showHiddenEvents)} className="text-[10px] text-slate-400 hover:text-violet-400 transition bg-slate-800 px-2 py-1 rounded">
                                            {showHiddenEvents ? "Voir les actifs" : `Corbeille (${hiddenEvents.length})`}
                                        </button>
                                    )}
                                </div>

                                {displayEvents.length === 0 ? <p className="text-slate-500 text-xs italic text-center py-4">Aucun événement {showHiddenEvents ? "dans la corbeille" : "visible"}.</p> : (
                                    <div className="flex flex-col gap-2 max-h-[250px] overflow-y-auto pr-1">
                                        {displayEvents.map((evt, idx) => (
                                            <div key={idx} className={`w-full flex items-center bg-slate-950 hover:bg-slate-800 border rounded-xl transition ${selectedEvent === evt ? 'border-violet-500 shadow-[0_0_10px_rgba(139,92,246,0.2)]' : 'border-slate-800'}`}>
                                                <button onClick={() => selectEventForManagement(evt)} className="flex-1 text-left p-3 flex flex-col overflow-hidden">
                                                    <span className="text-violet-400 font-bold text-xs">Événement {formatAddress(evt)}</span>
                                                    <span className="text-slate-500 font-mono text-[9px] truncate mt-0.5">{evt}</span>
                                                </button>
                                                {showHiddenEvents ? (
                                                    <button onClick={(e) => restoreEvent(evt, e)} className="p-3 text-slate-500 hover:text-emerald-400 transition" title="Restaurer cet événement">
                                                        ♻️
                                                    </button>
                                                ) : (
                                                    <button onClick={(e) => hideEvent(evt, e)} className="p-3 text-slate-600 hover:text-red-400 transition" title="Cacher cet événement">
                                                        🗑️
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="lg:col-span-2">
                            {selectedEvent && eventDetails.name ? (
                                <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-lg h-full flex flex-col animate-fade-in">
                                    <div className="flex gap-4 mb-6 bg-slate-950 p-4 rounded-xl border border-slate-800">
                                        <img src={eventDetails.flyer} alt="Flyer" className="w-24 h-24 object-cover rounded-lg border border-slate-700" onError={(e) => e.target.src = 'https://via.placeholder.com/150/1e293b/a78bfa?text=Image+Invalide'} />
                                        <div className="flex-1">
                                            <h3 className="text-xl font-bold text-violet-400 mb-1">{eventDetails.name}</h3>
                                            <p className="text-sky-300 text-xs font-bold mb-2">📅 Le {eventDetails.start}</p>
                                            <p className="text-slate-500 font-mono text-[10px] truncate">{selectedEvent}</p>
                                        </div>
                                        {!eventDetails.isCancelled && (
                                            <button onClick={handleCancelEvent} className="bg-red-900/40 hover:bg-red-600 border border-red-700 text-white font-bold text-xs px-4 rounded-xl transition self-start h-10">
                                                ANNULER L'ÉVÉNEMENT
                                            </button>
                                        )}
                                        {eventDetails.isCancelled && (
                                            <div className="bg-red-600 text-white font-bold text-xs px-4 py-2 rounded-xl self-start">
                                                ÉVÉNEMENT ANNULÉ
                                            </div>
                                        )}
                                    </div>
                                    
                                    <div className="grid grid-cols-3 gap-4 mb-8">
                                        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-center">
                                            <p className="text-[10px] text-slate-500 uppercase font-bold">Prix d'Achat</p>
                                            <p className="text-xl font-bold text-white mt-1">{eventDetails.price} <span className="text-xs text-slate-500">USDC</span></p>
                                        </div>
                                        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-center">
                                            <p className="text-[10px] text-slate-500 uppercase font-bold">Jauge</p>
                                            <p className="text-xl font-bold text-violet-400 mt-1">{eventDetails.maxSeats} <span className="text-xs text-slate-500">places</span></p>
                                        </div>
                                        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-center relative overflow-hidden group">
                                            {eventDetails.isCancelled ? (
                                                <div className="flex flex-col items-center justify-center h-full text-emerald-400">
                                                    <p className="text-[10px] font-bold uppercase">Remboursements</p>
                                                    <p className="text-sm font-bold">Ouverts à tous</p>
                                                </div>
                                            ) : eventDetails.deadlineUnix > 0 ? (
                                                <>
                                                    <p className="text-[10px] text-slate-500 uppercase font-bold group-hover:opacity-0 transition">Limite Remboursement</p>
                                                    <p className="text-xs font-bold text-emerald-400 mt-2 truncate group-hover:opacity-0 transition">{eventDetails.deadline}</p>
                                                    <button onClick={handleDisableRefunds} className="absolute inset-0 bg-red-600/90 text-white font-bold text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                                                        DÉSACTIVER LES REMBOURSEMENTS
                                                    </button>
                                                </>
                                            ) : (
                                                <div className="flex flex-col items-center justify-center h-full text-red-500">
                                                    <p className="text-[10px] font-bold uppercase">Remboursements</p>
                                                    <p className="text-sm font-bold">Désactivés</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {!eventDetails.isCancelled && (
                                    <div className="flex flex-col gap-4 bg-slate-950 p-4 rounded-xl border border-slate-800">
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wide border-b border-slate-800 pb-2 mb-1">Paramètres Modifiables</p>
                                        <form onSubmit={handleUpdateMarkup} className="flex flex-col sm:flex-row items-start sm:items-end gap-3 justify-between">
                                            <div className="flex-1 w-full">
                                                <label className="text-[10px] text-slate-500 font-bold">Plafond Anti-Scalping : <span className="text-violet-400 font-mono">{eventDetails.markup}%</span></label>
                                                <input type="number" value={modifMarkup} onChange={(e) => setModifMarkup(e.target.value)} className="w-full mt-1 bg-slate-900 border border-slate-800 px-3 py-2 rounded-lg text-xs outline-none focus:border-violet-500" required />
                                            </div>
                                            <button type="submit" className="bg-slate-800 hover:bg-violet-600 border border-slate-700 text-white font-bold text-xs px-4 py-2 rounded-lg transition h-9 w-full sm:w-auto">MàJ</button>
                                        </form>
                                        <form onSubmit={handleUpdateRoyalty} className="flex flex-col sm:flex-row items-start sm:items-end gap-3 justify-between mt-2">
                                            <div className="flex-1 w-full">
                                                <label className="text-[10px] text-slate-500 font-bold">Royalties sur la Revente : <span className="text-violet-400 font-mono">{eventDetails.royalty}%</span></label>
                                                <input type="number" value={modifRoyalty} onChange={(e) => setModifRoyalty(e.target.value)} className="w-full mt-1 bg-slate-900 border border-slate-800 px-3 py-2 rounded-lg text-xs outline-none focus:border-violet-500" required />
                                            </div>
                                            <button type="submit" className="bg-slate-800 hover:bg-violet-600 border border-slate-700 text-white font-bold text-xs px-4 py-2 rounded-lg transition h-9 w-full sm:w-auto">MàJ</button>
                                        </form>
                                        <form onSubmit={handleUpdateDeadline} className="flex flex-col gap-2 mt-2">
                                            <label className="text-[10px] text-slate-500 font-bold">Repousser la fermeture des remboursements</label>
                                            <div className="flex flex-col sm:flex-row gap-3">
                                                <input type="datetime-local" value={modifDeadlineDate} onChange={(e) => setModifDeadlineDate(e.target.value)} className="flex-1 bg-slate-900 border border-slate-800 px-3 py-2 rounded-lg text-xs outline-none focus:border-violet-500 w-full" required />
                                                <button type="submit" className="bg-slate-800 hover:bg-violet-600 border border-slate-700 text-white font-bold text-xs px-4 rounded-lg transition h-9 w-full sm:w-auto">Appliquer</button>
                                            </div>
                                        </form>
                                    </div>
                                    )}
                                </div>
                            ) : (
                                <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl h-full flex flex-col items-center justify-center text-center text-slate-500 border-dashed">
                                    <span className="text-3xl">⚙️</span>
                                    <p className="text-xs italic mt-2">Sélectionnez un événement pour ouvrir sa console.</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* --- SPECTATEUR --- */}
                {activeTab === 'spectator' && (
                    <div className="flex flex-col items-center animate-fade-in">
                        
                        {mySeatsWithOffers.length > 0 && targetEvent && (
                            <div className="w-full max-w-3xl mb-4 bg-sky-900/40 border border-sky-500 p-4 rounded-xl flex items-center justify-between shadow-[0_0_15px_rgba(14,165,233,0.3)]">
                                <div className="flex items-center gap-3">
                                    <span className="text-2xl animate-bounce">🔔</span>
                                    <div>
                                        <p className="text-sky-300 font-bold text-sm">Vous avez des offres en attente !</p>
                                        <p className="text-slate-300 text-xs mt-0.5">Cliquez sur les sièges lumineux ({mySeatsWithOffers.join(', ')}) pour voir les propositions.</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="w-full max-w-3xl bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-lg mb-6">
                            <label className="text-[10px] text-sky-400 uppercase font-bold ml-1">📍 Quelle salle voulez-vous rejoindre ?</label>
                            
                            <div className="relative w-full mt-2">
                                <div className="bg-slate-950 border border-slate-800 p-3.5 rounded-xl cursor-pointer hover:border-sky-500 transition" onClick={() => setIsDropdownOpen(!isDropdownOpen)}>
                                    {targetEvent ? (
                                        <div>
                                            <p className="text-white font-bold text-sm">{targetEvent.eventName}</p>
                                            <p className="text-slate-500 font-mono text-[10px] mt-0.5">{targetEvent.eventAddress}</p>
                                        </div>
                                    ) : (
                                        <p className="text-slate-500 text-sm py-1">Sélectionnez un spectacle existant...</p>
                                    )}
                                </div>
                                
                                {isDropdownOpen && (
                                    <div className="absolute z-50 w-full mt-2 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-h-60 overflow-y-auto">
                                        {allAvailableEvents.length === 0 ? (
                                            <p className="p-4 text-xs text-slate-500 text-center">Aucun événement créé sur le réseau.</p>
                                        ) : (
                                            allAvailableEvents.map((evt, idx) => {
                                                const dateOptions = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' };
                                                const formattedStart = new Date(Number(evt.eventStart) * 1000).toLocaleString('fr-FR', dateOptions);
                                                return (
                                                <div key={idx} onClick={() => { setTargetEvent(evt); setIsDropdownOpen(false); }} className="flex gap-4 p-3.5 border-b border-slate-800 hover:bg-slate-800 cursor-pointer transition items-center">
                                                    <img src={evt.flyerUrl} alt="" className="w-12 h-12 object-cover rounded-md border border-slate-700" onError={(e) => e.target.src = 'https://via.placeholder.com/50/1e293b/a78bfa'} />
                                                    <div>
                                                        <p className="text-white font-bold text-sm">{evt.eventName}</p>
                                                        <p className="text-sky-400 text-[10px] font-bold mt-0.5">Le {formattedStart}</p>
                                                    </div>
                                                </div>
                                                );
                                            })
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {targetEvent && (
                            <div className="w-full max-w-3xl mb-6 rounded-2xl overflow-hidden shadow-2xl border border-slate-800 relative bg-slate-900 group">
                                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent z-10"></div>
                                <img src={targetEvent.flyerUrl} alt="Flyer complet" className="w-full h-48 object-cover opacity-60 group-hover:scale-105 transition duration-700" onError={(e) => e.target.src = 'https://via.placeholder.com/800x300/0f172a/38bdf8'} />
                                <div className="absolute bottom-0 left-0 w-full p-6 z-20 flex justify-between items-end">
                                    <div>
                                        <h2 className="text-3xl font-bold text-white mb-1 drop-shadow-md">{targetEvent.eventName}</h2>
                                        <p className="text-sky-400 text-sm font-bold flex items-center gap-2">
                                            <span>📅</span> {new Date(Number(targetEvent.eventStart) * 1000).toLocaleString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] text-slate-400 uppercase font-mono mb-1">Contrat Officiel</p>
                                        <p className="text-slate-300 font-mono text-xs bg-slate-900/50 px-2 py-1 rounded border border-slate-700 backdrop-blur-md">{formatAddress(targetEvent.eventAddress)}</p>
                                    </div>
                                </div>
                            </div>
                        )}
                        
                        {currentEventIsCancelled && (
                            <div className="w-full max-w-3xl mb-6 bg-red-900/40 border border-red-600 p-4 rounded-xl text-center">
                                <h3 className="text-red-400 font-bold text-lg">⚠️ ÉVÉNEMENT ANNULÉ</h3>
                                <p className="text-slate-300 text-xs mt-1">L'organisateur a annulé ce spectacle. Les achats et échanges sont suspendus. Si vous possédez un billet, vous pouvez demander un remboursement immédiat ci-dessous.</p>
                            </div>
                        )}

                        {/* --- NOUVEAU : LISTE DES BILLETS POSSÉDÉS AVEC ACCÈS DIRECT AU QR CODE --- */}
                        {myOwnedSeats.length > 0 && targetEvent && (
                            <div className="w-full max-w-3xl mb-6 bg-violet-900/20 border border-violet-800 p-5 rounded-2xl shadow-lg">
                                <h3 className="text-sm font-bold text-violet-300 mb-4 uppercase tracking-wider flex items-center gap-2">
                                    <span>🎟️</span> Mes Billets pour cet événement
                                </h3>
                                <div className="flex flex-wrap gap-3">
                                    {myOwnedSeats.map(seat => (
                                        <button 
                                            key={seat}
                                            onClick={() => {
                                                setSelectedSeat(seat);
                                                setShowQRModal(true);
                                            }}
                                            className="bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold px-4 py-2 rounded-lg transition flex items-center gap-2 shadow-[0_0_10px_rgba(139,92,246,0.3)]"
                                        >
                                            Siège {seat} <span className="text-lg">📱</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="w-full max-w-3xl flex flex-col items-center bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-lg relative overflow-hidden">
                            {!targetEvent && (
                                <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm z-10 flex items-center justify-center">
                                    <p className="bg-slate-900 border border-slate-700 px-6 py-3 rounded-full text-xs font-bold text-slate-400 shadow-xl">Sélectionnez un événement pour afficher le plan</p>
                                </div>
                            )}

                            <h3 className="text-sm font-bold text-slate-300 mb-8 uppercase tracking-wider">Plan de la Salle ({currentEventTotalSeats} places)</h3>
                            <div className="w-2/3 h-2 bg-gradient-to-r from-slate-800 via-slate-500 to-slate-800 rounded-t-full mb-12 relative">
                                <p className="absolute w-full text-center text-[10px] text-slate-500 top-3 font-mono uppercase">Scène Principale</p>
                            </div>

                            <div className="flex flex-col gap-4">
                                {generatedRowsArray.map((row, rowIndex) => (
                                    <div key={row} className="flex items-center gap-2 sm:gap-4">
                                        <div className="text-slate-600 text-xs font-mono w-4">{row}</div>
                                        <div className="flex gap-1.5 sm:gap-2">
                                            {Array.from({ length: seatsPerRow }).map((_, i) => {
                                                const seatNumberInRow = i + 1;
                                                const absoluteSeatId = (rowIndex * seatsPerRow) + seatNumberInRow;
                                                
                                                if (absoluteSeatId > currentEventTotalSeats) return null;

                                                const seatIdStr = `${row}${seatNumberInRow}`;
                                                const isTaken = takenSeats.includes(seatIdStr);
                                                const isOwned = myOwnedSeats.includes(seatIdStr);
                                                const isResale = Object.keys(resaleListings).includes(seatIdStr);
                                                const isSelected = selectedSeat === seatIdStr;
                                                const hasIncomingOffer = isOwned && activeOffers[seatIdStr]; 

                                                let seatStyle = "bg-sky-600 hover:bg-sky-400 cursor-pointer text-white"; 
                                                
                                                if (isSelected) {
                                                    seatStyle = "bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.6)] scale-110 z-10 relative text-white"; 
                                                } else if (hasIncomingOffer) {
                                                    seatStyle = "bg-violet-500 ring-2 ring-sky-400 animate-pulse text-white cursor-pointer shadow-[0_0_15px_rgba(56,189,248,0.6)]";
                                                } else if (isOwned) {
                                                    seatStyle = isResale ? "bg-violet-500 border-2 border-orange-400 cursor-pointer text-white" : "bg-violet-500 hover:bg-violet-400 cursor-pointer shadow-[0_0_10px_rgba(139,92,246,0.4)] text-white";
                                                } else if (isResale) {
                                                    seatStyle = "bg-orange-500 hover:bg-orange-400 cursor-pointer text-white";
                                                } else if (isTaken) {
                                                    seatStyle = "bg-slate-600 cursor-pointer text-slate-300 opacity-80"; 
                                                }

                                                return (
                                                    <div key={seatIdStr} onClick={() => (!isTaken || isResale || isOwned || isTaken) && setSelectedSeat(seatIdStr)}
                                                        className={`w-7 h-7 sm:w-9 sm:h-9 rounded-t-lg rounded-b-sm flex items-center justify-center text-[10px] sm:text-xs font-bold transition-all duration-200 ${seatStyle}`}
                                                    >
                                                        {seatNumberInRow}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        <div className="text-slate-600 text-xs font-mono w-4 text-right">{row}</div>
                                    </div>
                                ))}
                            </div>

                            <div className="mt-12 flex flex-wrap justify-center gap-6 text-[10px] font-mono text-slate-400 uppercase">
                                <div className="flex items-center gap-2"><span className="w-3 h-3 bg-sky-600 rounded-sm"></span> Libre</div>
                                <div className="flex items-center gap-2"><span className="w-3 h-3 bg-violet-500 rounded-sm"></span> Mes Billets</div>
                                <div className="flex items-center gap-2"><span className="w-3 h-3 bg-orange-500 rounded-sm"></span> Revente</div>
                                <div className="flex items-center gap-2"><span className="w-3 h-3 bg-slate-600 rounded-sm opacity-80"></span> Vendu</div>
                            </div>
                        </div>

                        {selectedSeat && targetEvent && (() => {
                            const isOwned = myOwnedSeats.includes(selectedSeat);
                            const isResale = Object.keys(resaleListings).includes(selectedSeat);
                            const isTaken = takenSeats.includes(selectedSeat) && !isOwned;
                            const resalePrice = isResale ? resaleListings[selectedSeat] : null;
                            const incomingOffer = activeOffers[selectedSeat];
                            
                            const isRefundActive = currentEventIsCancelled || currentEventRefundDeadline > Math.floor(Date.now() / 1000);

                            return (
                                <div className="mt-6 w-full max-w-3xl bg-slate-950 border border-slate-800 p-5 rounded-2xl flex flex-col animate-fade-in shadow-2xl gap-4">
                                    <div className="flex flex-col md:flex-row justify-between items-center w-full gap-4">
                                        <div>
                                            <p className="text-white font-bold text-sm">Siège sélectionné : <span className="text-emerald-400">{selectedSeat}</span></p>
                                            <p className="text-slate-500 text-xs mt-1">Numéro Blockchain : #{getSeatIdNumber(selectedSeat)}</p>
                                            
                                            {isOwned && !isResale && !incomingOffer && (
                                                <button onClick={() => setShowQRModal(true)} className="mt-3 bg-violet-600/20 hover:bg-violet-600/40 border border-violet-500/50 text-violet-300 text-xs font-bold px-4 py-2 rounded-lg transition flex items-center gap-2">
                                                    <span>🎟️</span> AFFICHER MON BILLET
                                                </button>
                                            )}
                                        </div>
                                        
                                        <div className="flex items-center gap-4">
                                            {isOwned ? (
                                                incomingOffer ? (
                                                    <div className="bg-sky-900/40 border border-sky-700 p-3 rounded-xl flex items-center gap-3">
                                                        <div>
                                                            <p className="text-xs text-sky-300 font-bold">🎉 Offre d'achat/échange reçue !</p>
                                                            <p className="text-[10px] text-slate-300">
                                                                {incomingOffer.offeredTicketStr !== "Aucun" 
                                                                    ? `Contre le siège ${incomingOffer.offeredTicketStr} + ${incomingOffer.usdcAmount} USDC`
                                                                    : `Contre ${incomingOffer.usdcAmount} USDC`}
                                                            </p>
                                                        </div>
                                                        {!currentEventIsCancelled && (
                                                        <button onClick={handleAcceptOffer} className="bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold px-4 py-2 rounded-lg transition">
                                                            ACCEPTER L'OFFRE
                                                        </button>
                                                        )}
                                                    </div>
                                                ) : isResale ? (
                                                    <>
                                                        <span className="text-orange-400 font-bold text-xs">En vente : {resalePrice} USDC</span>
                                                        <button onClick={handleCancelResale} className="bg-red-600 hover:bg-red-500 text-white text-xs font-bold px-6 py-3.5 rounded-xl transition">
                                                            ANNULER LA VENTE
                                                        </button>
                                                    </>
                                                ) : (
                                                    <div className="flex flex-col gap-2">
                                                        {isRefundActive ? (
                                                            <button onClick={handleRefundTicket} className="bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-500/50 text-emerald-400 text-xs font-bold px-6 py-2 rounded-xl transition w-full">
                                                                REMBOURSEMENT INSTANTANÉ
                                                            </button>
                                                        ) : (
                                                            <p className="text-[10px] text-slate-500 text-center font-bold">Remboursements terminés</p>
                                                        )}
                                                        
                                                        {!currentEventIsCancelled && (
                                                        <div className="flex gap-2">
                                                            <input type="number" placeholder="Prix USDC" value={resalePriceInput} onChange={(e) => setResalePriceInput(e.target.value)} className="w-24 bg-slate-900 border border-slate-700 rounded-xl px-3 text-xs outline-none text-white font-mono" />
                                                            <button onClick={handleListForResale} className="bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold px-6 py-3 rounded-xl transition flex-1">
                                                                METTRE EN VENTE
                                                            </button>
                                                        </div>
                                                        )}
                                                    </div>
                                                )
                                            ) : isResale && !currentEventIsCancelled ? (
                                                <button onClick={handleBuyResaleTicket} className="bg-orange-500 hover:bg-orange-400 text-white text-xs font-bold px-8 py-3.5 rounded-xl transition shadow-[0_0_15px_rgba(249,115,22,0.3)]">
                                                    ACHETER REVENTE ({resalePrice} USDC)
                                                </button>
                                            ) : isTaken && !currentEventIsCancelled ? (
                                                <div className="flex flex-col sm:flex-row gap-2 items-center bg-slate-900 p-2 rounded-xl border border-slate-800">
                                                    <select value={offerSeatInput} onChange={(e) => setOfferSeatInput(e.target.value)} className="bg-slate-950 border border-slate-700 text-white text-xs px-2 py-2 rounded-lg outline-none cursor-pointer">
                                                        <option value="0">Aucun billet (USDC uniquement)</option>
                                                        {myOwnedSeats.map(seat => <option key={seat} value={seat}>Mon siège {seat}</option>)}
                                                    </select>
                                                    <span className="text-slate-500 font-bold text-xs">+</span>
                                                    <input type="number" placeholder="Montant USDC" value={offerUsdcInput} onChange={(e) => setOfferUsdcInput(e.target.value)} className="w-24 bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 text-xs outline-none text-white font-mono" />
                                                    <button onClick={handleMakeOffer} className="bg-sky-600 hover:bg-sky-500 text-white text-[10px] font-bold px-4 py-2.5 rounded-lg transition ml-2">
                                                        FAIRE UNE OFFRE
                                                    </button>
                                                </div>
                                            ) : !currentEventIsCancelled ? (
                                                <button onClick={handleBuyTicket} className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-8 py-3.5 rounded-xl transition shadow-[0_0_15px_rgba(16,185,129,0.3)]">
                                                    ACHETER ({currentEventPrice} USDC)
                                                </button>
                                            ) : (
                                                <p className="text-red-500 font-bold text-xs">Achat impossible (Événement annulé)</p>
                                            )}
                                        </div>
                                    </div>
                                    
                                    {seatActionStatus.text && (
                                        <div className={`w-full text-center text-xs font-bold p-3 rounded-xl border transition mt-4 ${seatActionStatus.isError ? 'bg-red-900/20 border-red-800 text-red-400' : 'bg-emerald-900/20 border-emerald-800 text-emerald-400'}`}>
                                            {seatActionStatus.isError ? '⚠️ ' : '✅ '} {seatActionStatus.text}
                                        </div>
                                    )}
                                </div>
                            );
                        })()}
                    </div>
                )}
            </div>
        </div>
    );
}




