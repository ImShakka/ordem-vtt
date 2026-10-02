import { useState, useEffect, useRef } from 'react';
import { Dice5, Image as ImageIcon, Users, MessageSquare, PlusCircle, X, Upload, Trash2, Maximize, Edit2, ChevronDown, ChevronRight, ZoomIn, ZoomOut, Pin, LocateFixed, MousePointer2, Hand, Pen, Eraser, Undo2, Wand2, Crosshair, ArrowUp, ArrowDown, Grid3x3 } from 'lucide-react';
import Cropper from 'react-easy-crop';
import { io } from 'socket.io-client';
import EmojiPicker from 'emoji-picker-react';

const SERVER_URL = window.location.origin;
const socket = io(SERVER_URL);

const ROLES = ['Buratino', 'Alysson', 'Romeu', 'Sarah', 'Mestre'];
const PEN_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#ffffff', '#000000'];

const getCroppedImg = async (imageSrc, pixelCrop) => {
  const image = new Image(); image.src = imageSrc; image.crossOrigin = 'anonymous'; 
  await new Promise(resolve => image.onload = resolve);
  const canvas = document.createElement('canvas'); canvas.width = pixelCrop.width; canvas.height = pixelCrop.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, pixelCrop.width, pixelCrop.height);
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
};

export default function App() {
  const [playerName, setPlayerName] = useState('');
  const [takenRoles, setTakenRoles] = useState([]);

  const [currentMap, setCurrentMap] = useState({ name: '', url: '' });
  const [savedMaps, setSavedMaps] = useState([]);
  const [savedTokens, setSavedTokens] = useState([]); 
  
  const [rolls, setRolls] = useState([]);
  const [boardTokens, setBoardTokens] = useState([]); 
  const [lines, setLines] = useState([]);
  const [currentLine, setCurrentLine] = useState(null);
  
  const [activeTool, setActiveTool] = useState('cursor'); 
  const [activeSubmenu, setActiveSubmenu] = useState(null); 
  
  const [penColor, setPenColor] = useState('#ef4444');
  const [isDrawing, setIsDrawing] = useState(false); 
  
  const [gridScale, setGridScale] = useState("1.5");
  const [selectedEmoji, setSelectedEmoji] = useState('🔥');

  const [showGrid, setShowGrid] = useState(false);
  const [gridWidth, setGridWidth] = useState(48);
  const [gridHeight, setGridHeight] = useState(48);

  const [selectedTokenIds, setSelectedTokenIds] = useState([]); 
  const [selectedLineIds, setSelectedLineIds] = useState([]); 
  const [selectionBox, setSelectionBox] = useState({ startX: 0, startY: 0, endX: 0, endY: 0, isSelecting: false });
  
  const [isCenariosOpen, setIsCenariosOpen] = useState(false);
  const [isPersonagensOpen, setIsPersonagensOpen] = useState(true);

  const [isUploadingMap, setIsUploadingMap] = useState(false);
  const [newMapName, setNewMapName] = useState('');
  const [mapFile, setMapFile] = useState(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingToken, setEditingToken] = useState(null); 
  const [newToken, setNewToken] = useState({ name: '', type: 'player' });
  const [isUploadingToken, setIsUploadingToken] = useState(false);
  
  const [imageSrc, setImageSrc] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [finalCroppedBlob, setFinalCroppedBlob] = useState(null);

  const mapContainerRef = useRef(null);
  const [mapTransform, setMapTransform] = useState({ scale: 1, x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  
  const [contextMenu, setContextMenu] = useState(null);
  const [pendingSpawnCoords, setPendingSpawnCoords] = useState(null);

  const activeToolRef = useRef(activeTool);
  useEffect(() => { activeToolRef.current = activeTool; }, [activeTool]);

  useEffect(() => {
    socket.on('gameState', (state) => { 
      setCurrentMap(state.currentMap); setBoardTokens(Object.values(state.tokens)); setRolls(state.rolls); setLines(state.lines || []); 
    });
    socket.on('takenRoles', (roles) => setTakenRoles(roles));
    socket.on('savedMaps', (maps) => setSavedMaps(maps));
    socket.on('savedTokens', (tokens) => setSavedTokens(tokens));
    socket.on('mapUpdated', (newMap) => setCurrentMap(newMap));
    socket.on('tokenUpdated', (tokenData) => {
      setBoardTokens((prev) => {
        const exists = prev.find(t => t.id === tokenData.id);
        if (exists) return prev.map(t => t.id === tokenData.id ? tokenData : t);
        return [...prev, tokenData];
      });
    });
    socket.on('tokenDeleted', (tokenId) => {
      setBoardTokens((prev) => prev.filter(t => t.id !== tokenId));
      setSelectedTokenIds((prev) => prev.filter(id => id !== tokenId)); 
    });
    socket.on('diceRolled', (newRolls) => setRolls(newRolls));
    socket.on('lineAdded', (newLine) => setLines(prev => [...prev, newLine]));
    socket.on('lineRemoved', (lineId) => {
      setLines(prev => prev.filter(l => l.id !== lineId));
      setSelectedLineIds((prev) => prev.filter(id => id !== lineId)); 
    });

    return () => {
      socket.off('gameState'); socket.off('takenRoles'); socket.off('savedMaps'); socket.off('savedTokens'); 
      socket.off('mapUpdated'); socket.off('tokenUpdated'); socket.off('tokenDeleted'); socket.off('diceRolled');
      socket.off('lineAdded'); socket.off('lineRemoved');
    };
  }, []);

  useEffect(() => {
    const handleGlobalWheel = (e) => {
      const isCameraTool = activeToolRef.current === 'camera';
      if (e.ctrlKey || e.metaKey || isCameraTool) {
        e.preventDefault(); 
        const container = mapContainerRef.current;
        if (container && container.contains(e.target)) {
          setMapTransform(prev => {
            const rect = container.getBoundingClientRect();
            const pointerX = e.clientX - rect.left; const pointerY = e.clientY - rect.top;
            const zoomSensitivity = 0.003;
            let delta = -e.deltaY * zoomSensitivity;
            let newScale = Math.min(Math.max(prev.scale + delta, 1), 4); 
            if (newScale === prev.scale) return prev;
            let newX = pointerX - ((pointerX - prev.x) / prev.scale) * newScale;
            let newY = pointerY - ((pointerY - prev.y) / prev.scale) * newScale;
            newX = Math.min(0, Math.max(newX, rect.width * (1 - newScale)));
            newY = Math.min(0, Math.max(newY, rect.height * (1 - newScale)));
            return { scale: newScale, x: newX, y: newY };
          });
        }
      }
    };
    window.addEventListener('wheel', handleGlobalWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleGlobalWheel);
  }, []);

  const handleToolClick = (tool) => {
    if (tool === 'cursor' || tool === 'camera' || tool === 'eraser') {
      setActiveTool(tool); setActiveSubmenu(null); return;
    }
    if (activeTool === tool) {
      if (activeSubmenu === tool) {
        setActiveTool('cursor'); setActiveSubmenu(null);
      } else { setActiveSubmenu(tool); }
    } else {
      setActiveTool(tool); setActiveSubmenu(tool);
    }
  };

  const getLayer = (item) => {
    if (item.layer) return item.layer;
    if (item.points || item.type === 'effect') return 3; 
    return 2; 
  };

  const getZIndex = (item, isSelected) => {
    const layer = getLayer(item); 
    const baseZ = layer === 2 ? 20 : 30; 
    let subZ = 2; 
    if (item.type === 'effect') subZ = 1; 
    if (isSelected) subZ += 5; 
    return baseZ + subZ;
  };

  const setSelectionLayer = (newLayer) => {
    selectedTokenIds.forEach(id => {
      const t = boardTokens.find(bt => bt.id === id);
      if (t && getLayer(t) !== newLayer) socket.emit('updateToken', { ...t, layer: newLayer });
    });
    selectedLineIds.forEach(id => {
      const l = lines.find(bl => bl.id === id);
      if (l && getLayer(l) !== newLayer) {
        socket.emit('removeLine', l.id);
        socket.emit('addLine', { ...l, layer: newLayer });
      }
    });
    setContextMenu(null);
  };

  const deleteSelection = () => {
    selectedTokenIds.forEach(id => socket.emit('removeTokenFromBoard', id));
    selectedLineIds.forEach(id => socket.emit('removeLine', id));
    setSelectedTokenIds([]); setSelectedLineIds([]);
  };

  const zoomAtPoint = (delta, clientX, clientY) => {
    setMapTransform(prev => {
      const container = mapContainerRef.current;
      if (!container) return prev;
      const rect = container.getBoundingClientRect();
      let newScale = Math.min(Math.max(prev.scale + delta, 1), 4);
      if (newScale === prev.scale) return prev;
      const pointerX = clientX !== undefined ? clientX - rect.left : rect.width / 2;
      const pointerY = clientY !== undefined ? clientY - rect.top : rect.height / 2;
      let newX = pointerX - ((pointerX - prev.x) / prev.scale) * newScale;
      let newY = pointerY - ((pointerY - prev.y) / prev.scale) * newScale;
      newX = Math.min(0, Math.max(newX, rect.width * (1 - newScale)));
      newY = Math.min(0, Math.max(newY, rect.height * (1 - newScale)));
      return { scale: newScale, x: newX, y: newY };
    });
  };

  const closeContextMenu = () => { if (contextMenu) setContextMenu(null); };

  const handleMapContextMenu = (e) => {
    if (e.target === e.currentTarget || e.target.id === 'map-layer' || e.target.tagName.toLowerCase() === 'svg') {
      const rect = e.currentTarget.getBoundingClientRect();
      const mapX = (e.clientX - rect.left - mapTransform.x) / mapTransform.scale;
      const mapY = (e.clientY - rect.top - mapTransform.y) / mapTransform.scale;
      setContextMenu({ x: e.clientX, y: e.clientY, type: 'map', mapX, mapY });
    }
  };

  const handleTokenContextMenu = (e, token) => {
    e.stopPropagation(); e.preventDefault();
    let targets = selectedTokenIds;
    if (!targets.includes(token.id)) { targets = [token.id]; setSelectedTokenIds(targets); setSelectedLineIds([]); }
    setContextMenu({ x: e.clientX, y: e.clientY, type: 'selection' });
  };

  const handleLineContextMenu = (e, line) => {
    e.stopPropagation(); e.preventDefault();
    let targets = selectedLineIds;
    if (!targets.includes(line.id)) { targets = [line.id]; setSelectedLineIds(targets); setSelectedTokenIds([]); }
    setContextMenu({ x: e.clientX, y: e.clientY, type: 'selection' });
  };

  const handleMapMouseDown = (e) => {
    closeContextMenu();
    if (e.button === 1) {
      e.preventDefault();
      if (activeTool === 'camera') setMapTransform({ scale: 1, x: 0, y: 0 }); else setIsPanning(true);
      return;
    }
    if (e.button !== 0) return;

    if (e.target === e.currentTarget || e.target.id === 'map-layer' || e.target.tagName.toLowerCase() === 'svg') {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = (e.clientX - rect.left - mapTransform.x) / mapTransform.scale;
      const y = (e.clientY - rect.top - mapTransform.y) / mapTransform.scale;

      if (activeTool === 'camera') { e.preventDefault(); setIsPanning(true); return; }
      
      if (activeTool === 'pen') {
        e.preventDefault(); setIsDrawing(true);
        setCurrentLine({ id: Date.now().toString(), type: 'pen', color: penColor, size: 4, points: [{x, y}], author: playerName, layer: 3 });
        return;
      }
      
      if (activeTool === 'laser') {
        e.preventDefault(); setIsDrawing(true);
        const parseScale = parseFloat(gridScale) || 1.5;
        setCurrentLine({ id: Date.now().toString(), type: 'laser', color: '#ef4444', size: 3, points: [{x, y}, {x, y}], author: playerName, layer: 3, gridScale: parseScale });
        return;
      }
      
      if (activeTool === 'effects') {
        e.preventDefault(); 
        socket.emit('updateToken', { 
          id: Date.now().toString() + Math.random().toString(36).substr(2, 5), 
          name: selectedEmoji, 
          type: 'effect', 
          x: x - 24, 
          y: y - 24, 
          size: 48, 
          isPinned: false, 
          layer: 3 
        });
        return;
      }
      
      if (activeTool === 'eraser') { e.preventDefault(); setIsDrawing(true); return; }

      if (activeTool === 'cursor') {
        if (e.shiftKey) {
          e.preventDefault(); setSelectionBox({ startX: x, startY: y, endX: x, endY: y, isSelecting: true });
        } else { setSelectedTokenIds([]); setSelectedLineIds([]); }
      }
    }
  };

  const handleMapMouseMove = (e) => {
    if (isPanning) {
      setMapTransform(prev => {
        const container = mapContainerRef.current;
        if (!container) return prev;
        const rect = container.getBoundingClientRect();
        let newX = prev.x + e.movementX; let newY = prev.y + e.movementY;
        newX = Math.min(0, Math.max(newX, rect.width * (1 - prev.scale)));
        newY = Math.min(0, Math.max(newY, rect.height * (1 - prev.scale)));
        return { ...prev, x: newX, y: newY };
      });
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const currentX = (e.clientX - rect.left - mapTransform.x) / mapTransform.scale; 
    const currentY = (e.clientY - rect.top - mapTransform.y) / mapTransform.scale;

    if (activeTool === 'pen' && isDrawing && currentLine) {
      setCurrentLine(prev => ({ ...prev, points: [...prev.points, {x: currentX, y: currentY}] })); return;
    }
    
    if (activeTool === 'laser' && isDrawing && currentLine) {
      setCurrentLine(prev => ({ ...prev, points: [prev.points[0], {x: currentX, y: currentY}] })); return;
    }

    if (selectionBox.isSelecting && activeTool === 'cursor') {
      setSelectionBox(prev => ({ ...prev, endX: currentX, endY: currentY }));
      const minX = Math.min(selectionBox.startX, currentX); const maxX = Math.max(selectionBox.startX, currentX);
      const minY = Math.min(selectionBox.startY, currentY); const maxY = Math.max(selectionBox.startY, currentY);
      
      const selectedT = boardTokens.filter(t => {
        if (t.isPinned) return false; 
        const size = t.size || 48; const centerX = t.x + size / 2; const centerY = t.y + size / 2;
        return centerX >= minX && centerX <= maxX && centerY >= minY && centerY <= maxY;
      }).map(t => t.id);
      setSelectedTokenIds(selectedT);

      const selectedL = lines.filter(l => {
        return l.points.some(p => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY);
      }).map(l => l.id);
      setSelectedLineIds(selectedL);
    }
  };

  const handleMapMouseUp = (e) => { 
    setIsPanning(false);
    if ((activeTool === 'pen' || activeTool === 'laser') && isDrawing && currentLine) {
      setIsDrawing(false); socket.emit('addLine', currentLine); setCurrentLine(null);
    }
    if (activeTool === 'eraser') setIsDrawing(false);
    if (selectionBox.isSelecting) setSelectionBox(prev => ({ ...prev, isSelecting: false })); 
  };

  const handleMapMouseLeave = () => {
    setIsPanning(false);
    if ((activeTool === 'pen' || activeTool === 'laser') && isDrawing && currentLine) {
      setIsDrawing(false); socket.emit('addLine', currentLine); setCurrentLine(null);
    }
    if (activeTool === 'eraser') setIsDrawing(false);
    if (selectionBox.isSelecting) setSelectionBox(prev => ({ ...prev, isSelecting: false }));
  };

  const handleDragStart = (e, token) => {
    if (activeTool !== 'cursor' || e.shiftKey || token.isPinned) { e.preventDefault(); return; } 
    closeContextMenu(); e.dataTransfer.setData('existingTokenId', token.id.toString());
  };

  const handleLibraryDragStart = (e, token) => e.dataTransfer.setData('libraryToken', JSON.stringify(token));

  const handleDrop = (e) => {
    if (activeTool !== 'cursor') return; 
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const existingId = e.dataTransfer.getData('existingTokenId');
    
    if (existingId) {
      const primaryToken = boardTokens.find(t => t.id.toString() === existingId);
      if (!primaryToken || primaryToken.isPinned) return;
      const newX = (e.clientX - rect.left - mapTransform.x) / mapTransform.scale - (primaryToken.size ? primaryToken.size/2 : 24);
      const newY = (e.clientY - rect.top - mapTransform.y) / mapTransform.scale - (primaryToken.size ? primaryToken.size/2 : 24);

      if (selectedTokenIds.includes(primaryToken.id)) {
        const deltaX = newX - primaryToken.x; const deltaY = newY - primaryToken.y;
        selectedTokenIds.forEach(selectedId => {
          const t = boardTokens.find(bt => bt.id === selectedId);
          if (t && !t.isPinned) socket.emit('updateToken', { ...t, x: t.x + deltaX, y: t.y + deltaY });
        });
      } else { socket.emit('updateToken', { ...primaryToken, x: newX, y: newY }); }
      return;
    }

    const libraryTokenStr = e.dataTransfer.getData('libraryToken');
    if (libraryTokenStr) {
      const libraryToken = JSON.parse(libraryTokenStr);
      
      if (libraryToken.type === 'player' && boardTokens.some(t => t.type === 'player' && t.name === libraryToken.name)) {
        alert(`O jogador ${libraryToken.name} já está no mapa!`);
        return;
      }

      const size = libraryToken.size || 48;
      const newX = (e.clientX - rect.left - mapTransform.x) / mapTransform.scale - (size / 2);
      const newY = (e.clientY - rect.top - mapTransform.y) / mapTransform.scale - (size / 2);
      socket.emit('updateToken', { ...libraryToken, id: Date.now().toString() + Math.random().toString(36).substr(2, 5), x: newX, y: newY, isPinned: false, layer: 2 });
    }
  };

  const handleTokenClick = (e, id) => {
    if (activeTool !== 'cursor') return; 
    e.stopPropagation(); closeContextMenu(); if (e.shiftKey) return; 
    if (e.ctrlKey || e.metaKey) {
      if (selectedTokenIds.includes(id)) setSelectedTokenIds(prev => prev.filter(tid => tid !== id)); 
      else setSelectedTokenIds(prev => [...prev, id]); 
    } else { setSelectedTokenIds([id]); setSelectedLineIds([]); }
  };

  const handleLineClick = (e, id) => {
    if (activeTool !== 'cursor') return;
    e.stopPropagation(); closeContextMenu(); if (e.shiftKey) return;
    if (e.ctrlKey || e.metaKey) {
      if (selectedLineIds.includes(id)) setSelectedLineIds(prev => prev.filter(tid => tid !== id)); 
      else setSelectedLineIds(prev => [...prev, id]); 
    } else { setSelectedLineIds([id]); setSelectedTokenIds([]); }
  };

  const togglePinTokens = (ids) => {
    ids.forEach(id => {
      const t = boardTokens.find(bt => bt.id === id);
      if (t) socket.emit('updateToken', { ...t, isPinned: !t.isPinned });
    });
  };

  const handleUndoLine = () => {
    const myLines = lines.filter(l => l.author === playerName);
    if (myLines.length > 0) socket.emit('removeLine', myLines[myLines.length - 1].id);
    setContextMenu(null);
  };

  // ====== ATALHOS DE TECLADO ======
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (isModalOpen) return;
      if (e.target.tagName.toLowerCase() === 'input' || e.target.tagName.toLowerCase() === 'textarea') return;

      // Apagar: Tecla Delete
      if (e.key === 'Delete') {
        if (selectedTokenIds.length > 0 || selectedLineIds.length > 0) {
          e.preventDefault();
          deleteSelection();
        }
      }

      // Desfazer
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndoLine();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedTokenIds, selectedLineIds, lines, playerName, isModalOpen]);

  const uploadFileToServer = async (file) => {
    const formData = new FormData(); formData.append('image', file);
    const response = await fetch(`${SERVER_URL}/upload`, { method: 'POST', body: formData });
    return (await response.json()).url;
  };

  const handleMapUpload = async (e) => {
    e.preventDefault(); if (!newMapName.trim() || !mapFile) return; setIsUploadingMap(true);
    try {
      const url = await uploadFileToServer(mapFile);
      socket.emit('saveNewMap', { id: Date.now().toString(), name: newMapName, url });
      setNewMapName(''); setMapFile(null);
    } catch { alert("Erro ao enviar mapa."); } setIsUploadingMap(false);
  };

  const rollDice = (sides) => socket.emit('rollDice', `[${playerName}] rolou um D${sides}: Tirou ${Math.floor(Math.random() * sides) + 1}`);

  const handleClearDiceRolls = () => { if (window.confirm("Isso vai apagar o histórico de rolagens de todos na mesa. Tem certeza?")) socket.emit('clearDiceRolls'); };

  const onFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const reader = new FileReader(); reader.readAsDataURL(e.target.files[0]); reader.onload = () => setImageSrc(reader.result);
    }
  };

  const confirmCrop = async () => {
    const croppedBlob = await getCroppedImg(imageSrc, croppedAreaPixels);
    setFinalCroppedBlob(croppedBlob); setImageSrc(null); 
  };

  const saveTokenSubmit = async (e) => {
    e.preventDefault(); if (!newToken.name.trim()) return; setIsUploadingToken(true);
    let finalImageUrl = editingToken ? editingToken.imageUrl : ''; 
    try {
      if (finalCroppedBlob) {
        const file = new File([finalCroppedBlob], "token.png", { type: "image/png" });
        finalImageUrl = await uploadFileToServer(file);
      }
      const tokenData = { name: newToken.name, imageUrl: finalImageUrl, type: newToken.type, size: 48, layer: 2 };

      if (editingToken) { socket.emit('editSavedToken', { ...editingToken, ...tokenData }); } 
      else { 
        const newLibToken = { id: Date.now().toString(), ...tokenData, isFixed: false };
        socket.emit('saveNewToken', newLibToken); 
        
        if (pendingSpawnCoords) { 
          if (newLibToken.type === 'player' && boardTokens.some(t => t.type === 'player' && t.name === newLibToken.name)) {
            alert(`O template foi salvo, mas o jogador ${newLibToken.name} já está no mapa!`);
          } else {
            socket.emit('updateToken', { ...newLibToken, id: newLibToken.id + Math.random().toString(36).substr(2, 5), x: pendingSpawnCoords.x - 24, y: pendingSpawnCoords.y - 24, isPinned: false }); 
          }
        }
      }
      closeModal();
    } catch { alert("Erro ao salvar personagem."); } setIsUploadingToken(false);
  };

  const spawnTokenOnMap = (savedToken) => {
    if (savedToken.type === 'player' && boardTokens.some(t => t.type === 'player' && t.name === savedToken.name)) {
      alert(`O jogador ${savedToken.name} já está no mapa!`);
      return;
    }
    socket.emit('updateToken', { ...savedToken, id: Date.now().toString() + Math.random().toString(36).substr(2, 5), x: 100, y: 100, isPinned: false, layer: 2 });
  };
  
  const tryClaimRole = (role) => socket.emit('claimRole', role, (res) => { if (res.success) setPlayerName(role); else alert('Alguém já pegou esse personagem!'); });
  const closeModal = () => { setIsModalOpen(false); setImageSrc(null); setFinalCroppedBlob(null); setEditingToken(null); setNewToken({ name: '', type: 'player' }); setPendingSpawnCoords(null); };
  const openEditModal = (token) => { setEditingToken(token); setNewToken({ name: token.name, type: token.type }); setImageSrc(token.imageUrl || null); setFinalCroppedBlob(null); setIsModalOpen(true); };

  if (!playerName) {
    return (
      <div className="flex h-screen bg-neutral-900 items-center justify-center font-sans">
        <div className="bg-neutral-950 p-8 rounded-xl border border-neutral-800 shadow-[0_0_40px_rgba(0,0,0,0.8)] w-96 text-center">
          <h1 className="text-3xl font-bold text-red-600 mb-2 tracking-widest uppercase">Ordem Vitaeternus</h1>
          <p className="text-neutral-400 mb-6 text-sm">Selecione quem você é na mesa:</p>
          <div className="flex flex-col gap-3">
            {ROLES.map(role => {
              const isTaken = takenRoles.includes(role);
              return (
                <button key={role} onClick={() => tryClaimRole(role)} disabled={isTaken} className={`w-full py-3 rounded uppercase tracking-wider font-bold transition-all ${isTaken ? 'bg-neutral-900 text-neutral-600 border border-neutral-800 cursor-not-allowed' : 'bg-red-700 hover:bg-red-600 text-white'}`}>
                  {role} {isTaken && <span className="text-xs ml-2 normal-case">(Online)</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  const getMapCursorClass = () => {
    if (activeTool === 'pen' || activeTool === 'laser') return 'cursor-crosshair';
    if (activeTool === 'effects') return 'cursor-copy';
    if (activeTool === 'eraser') return 'cursor-cell';
    if (activeTool === 'camera') return isPanning ? 'cursor-grabbing' : 'cursor-grab';
    return 'cursor-default';
  };

  const renderLine = (line, isActive) => {
    const isSelected = selectedLineIds.includes(line.id);
    
    const renderGhost = (pointsStr) => {
      if (isActive || (activeTool !== 'eraser' && activeTool !== 'cursor')) return null;
      return (
        <polyline points={pointsStr} stroke="transparent" strokeWidth={line.size + 20} fill="none" strokeLinecap="round" strokeLinejoin="round" 
          style={{ pointerEvents: 'stroke', cursor: activeTool === 'eraser' ? 'cell' : 'pointer' }} 
          onPointerEnter={() => { if (activeTool === 'eraser' && isDrawing) socket.emit('removeLine', line.id); }} 
          onPointerDown={(e) => {
            if (activeTool === 'eraser') socket.emit('removeLine', line.id);
            else if (activeTool === 'cursor') handleLineClick(e, line.id);
          }} 
          onContextMenu={(e) => { if(activeTool === 'cursor') handleLineContextMenu(e, line); }} 
        />
      );
    };

    if (line.type === 'laser') {
      const p1 = line.points[0]; const p2 = line.points[1];
      if (!p1 || !p2) return null;
      const pointsStr = `${p1.x},${p1.y} ${p2.x},${p2.y}`;
      const lineScale = line.gridScale || 1.5;
      const distMeters = ((Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2)) / 48) * lineScale).toFixed(1);
      const midX = (p1.x + p2.x) / 2; const midY = (p1.y + p2.y) / 2;
      
      return (
        <g key={line.id || 'current'}>
          {isSelected && <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="white" strokeWidth={line.size + 8} strokeLinecap="round" opacity="0.6" style={{ pointerEvents: 'none' }} />}
          <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={line.color} strokeWidth={line.size + 6} strokeOpacity="0.4" strokeLinecap="round" style={{ pointerEvents: 'none' }} />
          <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={line.color} strokeWidth={line.size} strokeLinecap="round" style={{ pointerEvents: 'none' }} />
          {renderGhost(pointsStr)}
          <text x={midX} y={midY - 15} fill="white" fontSize="16" fontWeight="bold" textAnchor="middle" style={{ pointerEvents: 'none', textShadow: '0px 0px 8px black, 0px 0px 8px black' }}>{distMeters}m</text>
        </g>
      );
    }
    
    const pointsStr = line.points.map(p => `${p.x},${p.y}`).join(' ');
    return (
      <g key={line.id || 'current'}>
        {isSelected && <polyline points={pointsStr} stroke="white" strokeWidth={line.size + 6} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" style={{ pointerEvents: 'none' }} />}
        <polyline points={pointsStr} stroke={line.color} strokeWidth={line.size} fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }} />
        {renderGhost(pointsStr)}
      </g>
    );
  };

  return (
    <div className="flex h-screen bg-neutral-900 text-neutral-100 font-sans relative overflow-hidden" onClick={closeContextMenu}>
      
      {/* ====== BARRA LATERAL ESQUERDA ====== */}
      <div className="w-16 bg-neutral-950 flex flex-col items-center py-4 border-r border-neutral-800 z-50 shadow-2xl">
        <div className="flex flex-col gap-4 w-full px-2">
          
          <button title="Cursor (Selecionar e Mover)" onClick={() => handleToolClick('cursor')} className={`w-full aspect-square rounded-xl flex items-center justify-center transition-colors ${activeTool === 'cursor' ? 'bg-red-600 text-white shadow-lg' : 'text-neutral-400 hover:bg-neutral-800'}`}><MousePointer2 size={24} /></button>
          
          <button title="Câmera (Mover e Zoom livre)" onClick={() => handleToolClick('camera')} className={`w-full aspect-square rounded-xl flex items-center justify-center transition-colors ${activeTool === 'camera' ? 'bg-red-600 text-white shadow-lg' : 'text-neutral-400 hover:bg-neutral-800'}`}><Hand size={24} /></button>
          
          <div className="relative w-full">
            <button title="Caneta (Desenhar no mapa)" onClick={() => handleToolClick('pen')} className={`w-full aspect-square rounded-xl flex items-center justify-center transition-colors ${activeTool === 'pen' ? 'bg-red-600 text-white shadow-lg' : 'text-neutral-400 hover:bg-neutral-800'}`}><Pen size={24} /></button>
            {activeSubmenu === 'pen' && (
              <div className="absolute left-14 top-0 bg-neutral-900 p-2 rounded-lg border border-neutral-800 shadow-2xl flex items-center gap-2 z-[100]">
                {PEN_COLORS.map(c => ( <button key={c} onClick={() => { setPenColor(c); setActiveSubmenu(null); }} className={`w-6 h-6 rounded-full border-2 ${penColor === c ? 'border-white scale-110' : 'border-transparent'}`} style={{ backgroundColor: c }} /> ))}
                <div className="w-px h-6 bg-neutral-700 mx-1"></div>
                <button onClick={(e) => { e.stopPropagation(); setActiveSubmenu(null); }} className="text-neutral-500 hover:text-white transition-colors p-1"><X size={16}/></button>
              </div>
            )}
          </div>

          <button title="Borracha (Apagar Linhas e Emojis)" onClick={() => handleToolClick('eraser')} className={`w-full aspect-square rounded-xl flex items-center justify-center transition-colors ${activeTool === 'eraser' ? 'bg-red-600 text-white shadow-lg' : 'text-neutral-400 hover:bg-neutral-800'}`}><Eraser size={24} /></button>

          <div className="relative w-full">
            <button title="Laser (Medir e Apontar)" onClick={() => handleToolClick('laser')} className={`w-full aspect-square rounded-xl flex items-center justify-center transition-colors ${activeTool === 'laser' ? 'bg-red-600 text-white shadow-lg' : 'text-neutral-400 hover:bg-neutral-800'}`}><Crosshair size={24} /></button>
            {activeSubmenu === 'laser' && (
              <div className="absolute left-14 top-0 bg-neutral-900 p-2 rounded-lg border border-neutral-800 shadow-2xl flex items-center gap-2 w-max z-[100]">
                <span className="text-[10px] text-neutral-400 font-bold">1 QUADRADO =</span>
                <input 
                  type="number" step="0.5" min="0.5" value={gridScale} 
                  onChange={(e) => setGridScale(e.target.value)} 
                  onKeyDown={(e) => { if (e.key === 'Enter') setActiveSubmenu(null); }} 
                  className="w-16 bg-neutral-950 border border-neutral-700 rounded p-1 text-xs text-white text-center focus:outline-none focus:border-red-600" 
                />
                <span className="text-[10px] text-neutral-400 font-bold">METROS</span>
                <div className="w-px h-6 bg-neutral-700 mx-1"></div>
                <button onClick={(e) => { e.stopPropagation(); setActiveSubmenu(null); }} className="text-neutral-500 hover:text-white transition-colors p-1"><X size={16}/></button>
              </div>
            )}
          </div>

          <div className="relative w-full">
            <button title="Tokens de Emojis" 
              onClick={() => handleToolClick('effects')} 
              className={`w-full aspect-square rounded-xl flex items-center justify-center relative transition-colors ${activeTool === 'effects' ? 'bg-red-600 text-white shadow-lg' : 'text-neutral-400 hover:bg-neutral-800'}`}>
              <Wand2 size={24} />
              <span className="absolute bottom-1 right-1 text-[10px] drop-shadow-md">{selectedEmoji}</span>
            </button>
            
            {activeSubmenu === 'effects' && (
              <div className="absolute left-16 top-0 z-[100] shadow-2xl rounded-lg overflow-hidden border border-neutral-800 bg-neutral-900 flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center p-2 border-b border-neutral-800 bg-neutral-950">
                  <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Escolher Emoji</span>
                  <button onClick={(e) => { e.stopPropagation(); setActiveSubmenu(null); }} className="text-neutral-500 hover:text-red-500 transition-colors p-1"><X size={16}/></button>
                </div>
                <EmojiPicker onEmojiClick={(e) => { setSelectedEmoji(e.emoji); setActiveSubmenu(null); }} theme="dark" />
              </div>
            )}
          </div>

          {/* GRADE (GRID) */}
          <div className="w-full h-px bg-neutral-800 my-2"></div>
          <div className="relative w-full">
            <button title="Exibir/Ocultar Grade (Grid)" 
              onClick={() => {
                if (showGrid && activeSubmenu === 'grid') {
                  setShowGrid(false); setActiveSubmenu(null);
                } else {
                  setShowGrid(true); setActiveSubmenu('grid');
                }
              }} 
              className={`w-full aspect-square rounded-xl flex items-center justify-center transition-colors ${showGrid ? 'bg-neutral-800 text-emerald-400 shadow-lg' : 'text-neutral-400 hover:bg-neutral-800'}`}>
              <Grid3x3 size={24} />
            </button>
            
            {activeSubmenu === 'grid' && (
              <div className="absolute left-14 top-0 bg-neutral-900 p-2 rounded-lg border border-neutral-800 shadow-2xl flex items-center gap-2 w-max z-[100]" onClick={e => e.stopPropagation()}>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-neutral-400 font-bold w-[50px]">LARGURA</span>
                    <input 
                      type="number" min="1" value={gridWidth} 
                      onChange={(e) => setGridWidth(e.target.value)} 
                      onKeyDown={(e) => { if (e.key === 'Enter') setActiveSubmenu(null); }} 
                      className="w-16 bg-neutral-950 border border-neutral-700 rounded p-1 text-xs text-white text-center focus:outline-none focus:border-emerald-500" 
                    />
                    <span className="text-[10px] text-neutral-400 font-bold">PX</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-neutral-400 font-bold w-[50px]">ALTURA</span>
                    <input 
                      type="number" min="1" value={gridHeight} 
                      onChange={(e) => setGridHeight(e.target.value)} 
                      onKeyDown={(e) => { if (e.key === 'Enter') setActiveSubmenu(null); }} 
                      className="w-16 bg-neutral-950 border border-neutral-700 rounded p-1 text-xs text-white text-center focus:outline-none focus:border-emerald-500" 
                    />
                    <span className="text-[10px] text-neutral-400 font-bold">PX</span>
                  </div>
                </div>
                <div className="w-px h-12 bg-neutral-700 mx-1"></div>
                <button onClick={(e) => { e.stopPropagation(); setActiveSubmenu(null); }} className="text-neutral-500 hover:text-white transition-colors p-1"><X size={16}/></button>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ====== MAPA ====== */}
      <div 
        ref={mapContainerRef} 
        className={`flex-1 relative bg-black border-r border-neutral-800 ${getMapCursorClass()}`}
        onDrop={handleDrop} onDragOver={e => e.preventDefault()} onMouseDown={handleMapMouseDown} onMouseMove={handleMapMouseMove} onMouseUp={handleMapMouseUp} onMouseLeave={handleMapMouseLeave} 
        onContextMenu={(e) => {
          e.preventDefault();
          if (activeTool === 'cursor') handleMapContextMenu(e);
          else if (activeTool === 'camera') setContextMenu({ x: e.clientX, y: e.clientY, type: 'camera' });
          else if (activeTool === 'pen') setContextMenu({ x: e.clientX, y: e.clientY, type: 'pen' });
          else if (activeTool === 'laser') setContextMenu({ x: e.clientX, y: e.clientY, type: 'laser' });
          else if (activeTool === 'effects') setContextMenu({ x: e.clientX, y: e.clientY, type: 'effects' });
          else if (activeTool === 'eraser') setContextMenu({ x: e.clientX, y: e.clientY, type: 'eraser' });
        }}
      >
        <div className="absolute top-4 left-4 flex flex-col gap-2 z-40">
          <button onClick={() => zoomAtPoint(0.2)} className="bg-neutral-900/90 p-2 rounded border border-neutral-700 text-white hover:bg-neutral-800 shadow-xl" title="Mais Zoom"><ZoomIn size={18}/></button>
          <button onClick={() => zoomAtPoint(-0.2)} className="bg-neutral-900/90 p-2 rounded border border-neutral-700 text-white hover:bg-neutral-800 shadow-xl" title="Menos Zoom"><ZoomOut size={18}/></button>
          <button onClick={() => setMapTransform({ scale: 1, x: 0, y: 0 })} className="bg-neutral-900/90 p-2 rounded border border-neutral-700 text-white hover:bg-neutral-800 shadow-xl flex items-center justify-center" title="Centralizar Câmera"><LocateFixed size={18}/></button>
          <span className="bg-neutral-900/90 px-2 py-1 rounded border border-neutral-700 text-white text-[10px] font-bold text-center shadow-xl">{Math.round(mapTransform.scale * 100)}%</span>
        </div>

        <div id="map-layer" className="absolute inset-0 origin-top-left" style={{ transform: `translate(${mapTransform.x}px, ${mapTransform.y}px) scale(${mapTransform.scale})`, backgroundImage: `url(${currentMap.url})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
          
          {/* A GRADE AQUI PROTEGE O MAPA SE O CAMPO ESTIVER VAZIO, USANDO O "|| 48" */}
          {showGrid && (
            <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 10, backgroundImage: 'linear-gradient(to right, rgba(255,255,255,0.15) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.15) 1px, transparent 1px)', backgroundSize: `${gridWidth || 48}px ${gridHeight || 48}px`, backgroundPosition: '0 0' }} />
          )}

          {/* ====== RENDERIZANDO CAMADA 2 ====== */}
          <svg className="absolute inset-0 w-full h-full overflow-visible" style={{ zIndex: 20, pointerEvents: 'none' }}>
            {lines.filter(l => getLayer(l) === 2).map(line => renderLine(line, false))}
          </svg>

          {boardTokens.filter(t => getLayer(t) === 2).map(token => {
            let styleClass = 'border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)]';
            let badgeColor = 'bg-emerald-950 border-emerald-500 text-emerald-100';
            
            if (token.type === 'enemy') { styleClass = 'border-red-600 shadow-[0_0_15px_rgba(220,38,38,0.5)]'; badgeColor = 'bg-red-950 border-red-600 text-red-100'; }
            else if (token.type === 'npc') { styleClass = 'border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.5)]'; badgeColor = 'bg-amber-950 border-amber-500 text-amber-100'; }
            else if (token.type === 'object') { styleClass = 'border-gray-400 shadow-[0_0_15px_rgba(156,163,175,0.5)]'; badgeColor = 'bg-gray-900 border-gray-400 text-gray-200'; }
            else if (token.type === 'effect') { styleClass = 'border-transparent shadow-none bg-transparent'; badgeColor = 'hidden'; }
            
            const isSelected = selectedTokenIds.includes(token.id); 
            const currentSize = token.size || 48;
            const isErasableEffect = token.type === 'effect' && activeTool === 'eraser';
            const isCursor = activeTool === 'cursor';
            const isInteractive = isCursor || isErasableEffect;

            return (
              <div key={token.id} draggable={!token.isPinned && isCursor} onDragStart={(e) => handleDragStart(e, token)} onClick={(e) => handleTokenClick(e, token.id)} onDoubleClick={(e) => { e.stopPropagation(); if(isCursor) socket.emit('removeTokenFromBoard', token.id); }} onContextMenu={(e) => { if(isCursor) handleTokenContextMenu(e, token); }}
                onMouseEnter={() => { if (isErasableEffect && isDrawing) socket.emit('removeTokenFromBoard', token.id); }}
                onMouseDown={(e) => { if (isErasableEffect && e.button === 0) { e.stopPropagation(); socket.emit('removeTokenFromBoard', token.id); } }}
                className={`absolute rounded-full border-2 flex items-center justify-center select-none bg-cover bg-center transition-shadow ${styleClass} ${isSelected && token.type !== 'effect' ? 'ring-4 ring-white' : ''} ${token.isPinned ? 'cursor-not-allowed' : (isCursor ? 'cursor-grab active:cursor-grabbing' : 'cursor-default')}`}
                style={{ zIndex: getZIndex(token, isSelected), pointerEvents: isInteractive ? 'auto' : 'none', left: `${token.x}px`, top: `${token.y}px`, width: `${currentSize}px`, height: `${currentSize}px`, backgroundImage: token.imageUrl ? `url(${token.imageUrl})` : 'none', transform: `scale(${1 / mapTransform.scale})`, transformOrigin: 'center' }} title={token.name}
              >
                {!token.imageUrl && token.type !== 'effect' && <span className="font-bold text-white shadow-black drop-shadow-md" style={{ fontSize: `${currentSize/3}px` }}>{token.name.substring(0, 2).toUpperCase()}</span>}
                {!token.imageUrl && token.type === 'effect' && <span style={{ fontSize: `${currentSize}px`, lineHeight: 1, pointerEvents: 'none', filter: 'drop-shadow(0px 0px 5px rgba(0,0,0,0.5))' }}>{token.name}</span>}
                {token.isPinned && <div className="absolute -bottom-1 -right-1 bg-neutral-900 rounded-full p-0.5 border border-neutral-500 text-white"><Pin size={10}/></div>}
                
                {isSelected && badgeColor !== 'hidden' && (
                  <div className={`absolute -top-10 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded border text-[10px] font-bold whitespace-nowrap shadow-xl ${badgeColor}`} style={{ zIndex: 51 }}>{token.name}</div>
                )}
              </div>
            )
          })}

          {/* ====== RENDERIZANDO CAMADA 3 ====== */}
          <svg className="absolute inset-0 w-full h-full overflow-visible" style={{ zIndex: 30, pointerEvents: 'none' }}>
            {lines.filter(l => getLayer(l) === 3).map(line => renderLine(line, false))}
            {currentLine && getLayer(currentLine) === 3 && renderLine(currentLine, true)}
          </svg>

          {boardTokens.filter(t => getLayer(t) === 3).map(token => {
            let styleClass = 'border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)]';
            let badgeColor = 'bg-emerald-950 border-emerald-500 text-emerald-100';
            
            if (token.type === 'enemy') { styleClass = 'border-red-600 shadow-[0_0_15px_rgba(220,38,38,0.5)]'; badgeColor = 'bg-red-950 border-red-600 text-red-100'; }
            else if (token.type === 'npc') { styleClass = 'border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.5)]'; badgeColor = 'bg-amber-950 border-amber-500 text-amber-100'; }
            else if (token.type === 'object') { styleClass = 'border-gray-400 shadow-[0_0_15px_rgba(156,163,175,0.5)]'; badgeColor = 'bg-gray-900 border-gray-400 text-gray-200'; }
            else if (token.type === 'effect') { styleClass = 'border-transparent shadow-none bg-transparent'; badgeColor = 'hidden'; }
            
            const isSelected = selectedTokenIds.includes(token.id); 
            const currentSize = token.size || 48;
            const isErasableEffect = token.type === 'effect' && activeTool === 'eraser';
            const isCursor = activeTool === 'cursor';
            const isInteractive = isCursor || isErasableEffect;

            return (
              <div key={token.id} draggable={!token.isPinned && isCursor} onDragStart={(e) => handleDragStart(e, token)} onClick={(e) => handleTokenClick(e, token.id)} onDoubleClick={(e) => { e.stopPropagation(); if(isCursor) socket.emit('removeTokenFromBoard', token.id); }} onContextMenu={(e) => { if(isCursor) handleTokenContextMenu(e, token); }}
                onMouseEnter={() => { if (isErasableEffect && isDrawing) socket.emit('removeTokenFromBoard', token.id); }}
                onMouseDown={(e) => { if (isErasableEffect && e.button === 0) { e.stopPropagation(); socket.emit('removeTokenFromBoard', token.id); } }}
                className={`absolute rounded-full border-2 flex items-center justify-center select-none bg-cover bg-center transition-shadow ${styleClass} ${isSelected && token.type !== 'effect' ? 'ring-4 ring-white' : ''} ${token.isPinned ? 'cursor-not-allowed' : (isCursor ? 'cursor-grab active:cursor-grabbing' : 'cursor-default')}`}
                style={{ zIndex: getZIndex(token, isSelected), pointerEvents: isInteractive ? 'auto' : 'none', left: `${token.x}px`, top: `${token.y}px`, width: `${currentSize}px`, height: `${currentSize}px`, backgroundImage: token.imageUrl ? `url(${token.imageUrl})` : 'none', transform: `scale(${1 / mapTransform.scale})`, transformOrigin: 'center' }} title={token.name}
              >
                {!token.imageUrl && token.type !== 'effect' && <span className="font-bold text-white shadow-black drop-shadow-md" style={{ fontSize: `${currentSize/3}px` }}>{token.name.substring(0, 2).toUpperCase()}</span>}
                {!token.imageUrl && token.type === 'effect' && <span style={{ fontSize: `${currentSize}px`, lineHeight: 1, pointerEvents: 'none', filter: 'drop-shadow(0px 0px 5px rgba(0,0,0,0.5))' }}>{token.name}</span>}
                {token.isPinned && <div className="absolute -bottom-1 -right-1 bg-neutral-900 rounded-full p-0.5 border border-neutral-500 text-white"><Pin size={10}/></div>}
                
                {isSelected && badgeColor !== 'hidden' && (
                  <div className={`absolute -top-10 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded border text-[10px] font-bold whitespace-nowrap shadow-xl ${badgeColor}`} style={{ zIndex: 51 }}>{token.name}</div>
                )}
              </div>
            )
          })}

          {/* CAIXA DE SELEÇÃO */}
          {selectionBox.isSelecting && activeTool === 'cursor' && (
            <div className="absolute border-2 border-emerald-500 bg-emerald-500/20 border-dashed pointer-events-none" style={{ zIndex: 50, left: Math.min(selectionBox.startX, selectionBox.endX), top: Math.min(selectionBox.startY, selectionBox.endY), width: Math.abs(selectionBox.endX - selectionBox.startX), height: Math.abs(selectionBox.endY - selectionBox.startY) }} />
          )}

        </div>

        {/* MENUS DE CONTEXTO */}
        {contextMenu && (
          <div className="fixed bg-neutral-950 border border-neutral-700 shadow-2xl rounded-lg py-2 w-64 z-[9999]" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>
            
            {contextMenu.type === 'camera' && (
              <>
                <button onClick={() => { zoomAtPoint(0.5, contextMenu.x, contextMenu.y); setContextMenu(null); }} className="w-full text-left px-4 py-2 hover:bg-neutral-800 text-sm text-white flex items-center gap-2"><ZoomIn size={14}/> Zoom In (+)</button>
                <button onClick={() => { zoomAtPoint(-0.5, contextMenu.x, contextMenu.y); setContextMenu(null); }} className="w-full text-left px-4 py-2 hover:bg-neutral-800 text-sm text-white flex items-center gap-2"><ZoomOut size={14}/> Zoom Out (-)</button>
                <div className="h-px bg-neutral-800 my-1"></div>
                <button onClick={() => { setMapTransform({ scale: 1, x: 0, y: 0 }); setContextMenu(null); }} className="w-full text-left px-4 py-2 hover:bg-neutral-800 text-sm text-white flex items-center gap-2"><LocateFixed size={14}/> Centralizar Câmera</button>
              </>
            )}

            {(contextMenu.type === 'pen' || contextMenu.type === 'laser') && (
              <>
                <button onClick={handleUndoLine} className="w-full text-left px-4 py-2 hover:bg-neutral-800 text-sm text-white flex items-center gap-2"><Undo2 size={14}/> Desfazer Último Desenho/Laser</button>
                <div className="h-px bg-neutral-800 my-1"></div>
                <button onClick={() => { handleToolClick('eraser'); setContextMenu(null); }} className="w-full text-left px-4 py-2 hover:bg-neutral-800 text-sm text-white flex items-center gap-2"><Eraser size={14}/> Trocar para Borracha</button>
                <button onClick={() => { handleToolClick('cursor'); setContextMenu(null); }} className="w-full text-left px-4 py-2 hover:bg-neutral-800 text-sm text-white flex items-center gap-2"><MousePointer2 size={14}/> Voltar para Cursor</button>
              </>
            )}

            {contextMenu.type === 'effects' && (
              <>
                <button onClick={() => { handleToolClick('eraser'); setContextMenu(null); }} className="w-full text-left px-4 py-2 hover:bg-neutral-800 text-sm text-white flex items-center gap-2"><Eraser size={14}/> Trocar para Borracha</button>
                <button onClick={() => { handleToolClick('cursor'); setContextMenu(null); }} className="w-full text-left px-4 py-2 hover:bg-neutral-800 text-sm text-white flex items-center gap-2"><MousePointer2 size={14}/> Voltar para Cursor</button>
              </>
            )}

            {contextMenu.type === 'eraser' && (
              <>
                <button onClick={() => { handleToolClick('pen'); setContextMenu(null); }} className="w-full text-left px-4 py-2 hover:bg-neutral-800 text-sm text-white flex items-center gap-2"><Pen size={14}/> Trocar para Caneta</button>
                <button onClick={() => { handleToolClick('cursor'); setContextMenu(null); }} className="w-full text-left px-4 py-2 hover:bg-neutral-800 text-sm text-white flex items-center gap-2"><MousePointer2 size={14}/> Voltar para Cursor</button>
              </>
            )}

            {contextMenu.type === 'selection' && (
              <>
                {selectedTokenIds.length === 1 && selectedLineIds.length === 0 && (
                  <button onClick={() => { openEditModal(boardTokens.find(t => t.id === selectedTokenIds[0])); setContextMenu(null); }} className="w-full text-left px-4 py-2 hover:bg-neutral-800 text-sm text-white flex items-center gap-2"><Edit2 size={14}/> Editar Imagem</button>
                )}
                
                {(selectedTokenIds.length > 0 || selectedLineIds.length > 0) && (
                  <>
                    <button onClick={() => setSelectionLayer(3)} className="w-full text-left px-4 py-2 hover:bg-neutral-800 text-sm text-white flex items-center gap-2 text-blue-400"><ArrowUp size={14}/> Subir Camada</button>
                    <button onClick={() => setSelectionLayer(2)} className="w-full text-left px-4 py-2 hover:bg-neutral-800 text-sm text-white flex items-center gap-2 text-blue-400"><ArrowDown size={14}/> Descer Camada</button>
                    <div className="h-px bg-neutral-800 my-1"></div>
                  </>
                )}

                {selectedTokenIds.length > 0 && (
                  <button onClick={() => { togglePinTokens(selectedTokenIds); setContextMenu(null); }} className="w-full text-left px-4 py-2 hover:bg-neutral-800 text-sm text-white flex items-center gap-2"><Pin size={14}/> Fixar / Desafixar Tokens</button>
                )}
                
                <button onClick={() => { deleteSelection(); setContextMenu(null); }} className="w-full text-left px-4 py-2 hover:bg-red-900/50 text-sm text-red-500 flex items-center gap-2"><Trash2 size={14}/> Remover do Mapa</button>
              </>
            )}
            
            {contextMenu.type === 'map' && (
              <>
                <button onClick={() => { setPendingSpawnCoords({ x: contextMenu.mapX, y: contextMenu.mapY }); setIsModalOpen(true); setContextMenu(null); }} className="w-full text-left px-4 py-2 hover:bg-neutral-800 text-sm text-white flex items-center gap-2"><PlusCircle size={14}/> Adicionar Novo Token Aqui</button>
                <div className="h-px bg-neutral-800 my-1"></div>
                <button onClick={() => { zoomAtPoint(0.5, contextMenu.x, contextMenu.y); setContextMenu(null); }} className="w-full text-left px-4 py-2 hover:bg-neutral-800 text-sm text-white flex items-center gap-2"><ZoomIn size={14}/> Zoom In (+)</button>
                <button onClick={() => { zoomAtPoint(-0.5, contextMenu.x, contextMenu.y); setContextMenu(null); }} className="w-full text-left px-4 py-2 hover:bg-neutral-800 text-sm text-white flex items-center gap-2"><ZoomOut size={14}/> Zoom Out (-)</button>
                <div className="h-px bg-neutral-800 my-1"></div>
                <button onClick={() => { setMapTransform({ scale: 1, x: 0, y: 0 }); setContextMenu(null); }} className="w-full text-left px-4 py-2 hover:bg-neutral-800 text-sm text-white flex items-center gap-2"><LocateFixed size={14}/> Centralizar Câmera</button>
              </>
            )}
          </div>
        )}

        {(selectedTokenIds.length > 0 || selectedLineIds.length > 0) && activeTool === 'cursor' && (() => {
          const totalSelected = selectedTokenIds.length + selectedLineIds.length;
          const firstSelectedToken = selectedTokenIds.length > 0 ? boardTokens.find(t => t.id === selectedTokenIds[0]) : null; 
          const titleText = totalSelected === 1 && firstSelectedToken ? firstSelectedToken.name : `${totalSelected} Itens Selecionados`;
          return (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-neutral-950 border border-neutral-700 p-4 rounded-xl flex items-center gap-6 shadow-[0_10px_30px_rgba(0,0,0,0.8)] z-50" onClick={e => e.stopPropagation()}>
              <span className="text-white font-bold text-sm uppercase tracking-wider">{titleText}</span>
              
              {firstSelectedToken && (
                <>
                  <div className="flex items-center gap-3">
                    <Maximize size={16} className="text-neutral-400"/>
                    <input type="range" min="24" max="250" value={firstSelectedToken.size || 48} onChange={(e) => { const newSize = parseInt(e.target.value); selectedTokenIds.forEach(id => { const t = boardTokens.find(bt => bt.id === id); if (t) socket.emit('updateToken', { ...t, size: newSize }); }); }} className="w-32 accent-red-600" />
                  </div>
                  <div className="h-6 w-px bg-neutral-700"></div>
                </>
              )}
              
              <button onClick={() => { deleteSelection(); }} className="text-red-500 hover:bg-red-900/30 p-2 rounded transition-colors flex items-center gap-2 text-xs font-bold uppercase"><Trash2 size={16} /> Apagar</button>
            </div>
          );
        })()}
      </div>

      {/* ====== PAINEL LATERAL DIREITO ====== */}
      <div className="w-80 bg-neutral-950 flex flex-col shadow-2xl z-40" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-neutral-800 bg-neutral-900 flex justify-between items-center">
          <div className="flex flex-col">
            <h1 className="text-lg font-bold text-red-600 tracking-widest flex items-center gap-2"><Users size={18} /> Ordem Vitaeternus</h1>
            <span className="text-xs text-neutral-500">Logado como <span className="text-emerald-500 font-bold">{playerName}</span></span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="mb-6">
            <button onClick={() => setIsCenariosOpen(!isCenariosOpen)} className="w-full flex justify-between items-center text-xs font-bold text-neutral-500 mb-3 uppercase tracking-wider hover:text-white transition-colors">
              <span className="flex items-center gap-2"><ImageIcon size={14} /> Cenários</span>{isCenariosOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            {isCenariosOpen && (
              <div className="space-y-3">
                <div className="flex gap-2 mb-3">
                  <select className="flex-1 bg-neutral-900 border border-neutral-700 rounded p-2 text-sm text-white focus:border-red-600" value={currentMap.id} onChange={(e) => socket.emit('changeMap', savedMaps.find(m => m.id === e.target.value))}>
                    {savedMaps.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                  <button onClick={() => window.confirm('Excluir este mapa?') && socket.emit('deleteMap', currentMap.id)} disabled={currentMap.isFixed} className="bg-neutral-900 border border-neutral-700 hover:border-red-600 hover:text-red-500 disabled:opacity-30 disabled:hover:border-neutral-700 disabled:hover:text-white p-2 rounded transition-colors text-neutral-400"><Trash2 size={16} /></button>
                </div>
                <form onSubmit={handleMapUpload} className="bg-neutral-900 p-3 rounded border border-neutral-800 space-y-3">
                  <span className="text-[10px] text-neutral-400 font-bold uppercase block">Novo Cenário</span>
                  <input type="text" required placeholder="Nome do Local" value={newMapName} onChange={e => setNewMapName(e.target.value)} className="w-full bg-neutral-950 border border-neutral-700 rounded p-2 text-xs text-white focus:border-red-600" />
                  <input type="file" required accept="image/*" onChange={e => setMapFile(e.target.files[0])} className="text-[10px] text-neutral-300 w-full file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-neutral-800 file:text-white" />
                  <button type="submit" disabled={isUploadingMap || !mapFile} className="w-full bg-neutral-800 hover:bg-neutral-700 text-xs font-bold p-2 rounded transition-colors disabled:opacity-50 flex items-center justify-center gap-2"><Upload size={14} /> {isUploadingMap ? 'Enviando...' : 'Fazer Upload'}</button>
                </form>
              </div>
            )}
          </div>

          <div className="mb-6">
            <button onClick={() => setIsPersonagensOpen(!isPersonagensOpen)} className="w-full flex justify-between items-center text-xs font-bold text-neutral-500 mb-3 uppercase tracking-wider hover:text-white transition-colors">
              <span className="flex items-center gap-2"><Users size={14} /> Personagens</span>{isPersonagensOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            {isPersonagensOpen && (
              <div className="flex flex-col gap-2">
                <button onClick={() => setIsModalOpen(true)} className="w-full bg-neutral-800 hover:bg-neutral-700 text-xs font-bold p-2 rounded transition-colors flex items-center justify-center gap-2 text-white mb-2"><PlusCircle size={14} /> Adicionar Novo Token</button>
                <div className="bg-neutral-900 border border-neutral-800 rounded p-2 max-h-60 overflow-y-auto space-y-2">
                  {savedTokens.map(token => (
                    <div key={token.id} draggable onDragStart={(e) => handleLibraryDragStart(e, token)} className="bg-neutral-950 p-2 rounded border border-neutral-800 flex justify-between items-center cursor-grab active:cursor-grabbing" title="Arraste para o mapa ou clique no +">
                      <div className="flex items-center gap-3 pointer-events-none">
                        <div className={`w-8 h-8 rounded-full border-2 bg-neutral-800 bg-cover bg-center flex items-center justify-center ${token.type === 'enemy' ? 'border-red-600' : token.type === 'npc' ? 'border-amber-500' : token.type === 'object' ? 'border-gray-400' : 'border-emerald-500'}`} style={{ backgroundImage: token.imageUrl ? `url(${token.imageUrl})` : 'none' }}>
                          {!token.imageUrl && <span className="text-[10px] font-bold text-white">{token.name.substring(0, 2).toUpperCase()}</span>}
                        </div>
                        <span className="text-xs font-bold text-neutral-300">{token.name}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => spawnTokenOnMap(token)} title="Adicionar no centro" className="p-1.5 text-emerald-600 hover:bg-emerald-900/30 rounded transition-colors"><PlusCircle size={16} /></button>
                        <button onClick={() => openEditModal(token)} title="Editar" className="p-1.5 text-blue-500 hover:bg-blue-900/30 rounded transition-colors"><Edit2 size={16} /></button>
                        {!token.isFixed && <button onClick={() => window.confirm(`Excluir ${token.name} para sempre?`) && socket.emit('deleteSavedToken', token.id)} className="p-1.5 text-red-600 hover:bg-red-900/30 rounded transition-colors"><Trash2 size={16} /></button>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="mb-6">
            <h2 className="text-xs font-bold text-neutral-500 mb-3 uppercase tracking-wider flex items-center gap-2"><Dice5 size={14} /> Dados</h2>
            <div className="grid grid-cols-4 gap-2">
              {[20, 12, 10, 8, 6, 4].map(d => <button key={d} onClick={() => rollDice(d)} className="bg-neutral-800 hover:bg-red-900 border border-neutral-700 hover:border-red-500 rounded py-2 text-xs font-bold transition-all">D{d}</button>)}
            </div>
          </div>
          
          <div className="flex-1 flex flex-col h-full min-h-[250px]">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-xs font-bold text-neutral-500 uppercase tracking-wider flex items-center gap-2"><MessageSquare size={14} /> Histórico</h2>
              <button onClick={handleClearDiceRolls} title="Apagar Histórico" className="text-neutral-500 hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
            </div>
            <div className="space-y-2 flex-1 overflow-y-auto pr-1">
              {rolls.length === 0 && <p className="text-xs text-neutral-600">Nenhum dado rolado ainda.</p>}
              {rolls.map(roll => (
                <div key={roll.id} className="bg-neutral-900 border-l-2 border-red-600 p-3 text-sm text-neutral-300"><span className="font-bold text-white block text-xs mb-1">{roll.text.split(']')[0]}]</span>{roll.text.split(']')[1]}</div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50" onClick={e => e.stopPropagation()}>
          <div className="bg-neutral-900 border border-neutral-700 rounded-lg p-6 w-96 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold text-white uppercase tracking-wider">{editingToken ? 'Editar Token' : 'Novo Token'}</h2>
              <button onClick={closeModal} className="text-neutral-400 hover:text-red-500"><X size={20} /></button>
            </div>
            {imageSrc ? (
              <div className="space-y-4">
                <p className="text-xs text-neutral-400 text-center">Arraste e use a barra para encaixar a imagem no círculo.</p>
                <div className="relative h-64 w-full bg-black rounded overflow-hidden">
                  <Cropper image={imageSrc} crop={crop} zoom={zoom} aspect={1} cropShape="round" showGrid={false} onCropChange={setCrop} onCropComplete={(a, pixels) => setCroppedAreaPixels(pixels)} onZoomChange={setZoom} />
                </div>
                <input type="range" value={zoom} min={1} max={3} step={0.1} onChange={(e) => setZoom(e.target.value)} className="w-full accent-red-600" />
                <div className="flex gap-2 mt-4">
                  <button onClick={() => { setImageSrc(null); setFinalCroppedBlob(null); }} className="flex-1 bg-neutral-800 hover:bg-neutral-700 text-white font-bold py-2 rounded text-sm">Cancelar / Voltar</button>
                  <button onClick={confirmCrop} className="flex-1 bg-red-700 hover:bg-red-600 text-white font-bold py-2 rounded text-sm">Confirmar Recorte</button>
                </div>
              </div>
            ) : (
              <form onSubmit={saveTokenSubmit} className="space-y-4">
                <div><label className="block text-xs font-bold text-neutral-500 mb-1 uppercase">Nome</label><input required type="text" disabled={editingToken?.isFixed} className="w-full bg-neutral-950 border border-neutral-700 rounded p-2 text-sm focus:outline-none focus:border-red-600 text-white disabled:opacity-50" value={newToken.name} onChange={(e) => setNewToken({...newToken, name: e.target.value})} /></div>
                <div>
                  <label className="block text-xs font-bold text-neutral-500 mb-1 uppercase">Foto de Perfil</label>
                  <div className="bg-neutral-950 p-2 rounded border border-neutral-800 text-center">
                    {finalCroppedBlob ? (
                      <div className="flex flex-col items-center gap-2">
                        <img src={URL.createObjectURL(finalCroppedBlob)} className="w-16 h-16 rounded-full border-2 border-red-600" alt="Preview"/>
                        <button type="button" onClick={() => setFinalCroppedBlob(null)} className="text-xs text-red-500 underline">Escolher outra imagem</button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        {editingToken && editingToken.imageUrl && <span className="text-[10px] text-neutral-500">Já possui uma imagem salva. Mande uma nova abaixo se quiser trocar.</span>}
                        <input type="file" accept="image/*" onChange={onFileChange} className="text-xs text-neutral-300 w-full file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:bg-neutral-800 file:text-white" />
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-500 mb-1 uppercase">Tipo</label>
                  <select disabled={editingToken?.isFixed} className="w-full bg-neutral-950 border border-neutral-700 rounded p-2 text-sm text-white focus:border-red-600 disabled:opacity-50" value={newToken.type} onChange={(e) => setNewToken({...newToken, type: e.target.value})}>
                    <option value="player">Jogador (Verde)</option><option value="enemy">Inimigo (Vermelho)</option><option value="npc">NPC (Amarelo)</option><option value="object">Objeto (Cinza)</option>
                  </select>
                </div>
                <button type="submit" disabled={isUploadingToken} className="w-full mt-4 bg-red-700 hover:bg-red-600 text-white font-bold py-2 rounded uppercase tracking-wider text-sm disabled:opacity-50 flex justify-center">{isUploadingToken ? 'Salvando...' : 'Salvar Token'}</button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}