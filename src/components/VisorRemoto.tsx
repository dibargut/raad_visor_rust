import React, { useEffect, useRef, useState, useCallback } from 'react';
import TerminalLite from './TerminalLite.tsx'; 

interface CoordenadasRelativas { x: number; y: number; w: number; h: number; }
type VistaApp = "desktop" | "video" | "terminal";

const win95Window = "bg-[#c0c0c0] border-2 border-t-white border-l-white border-b-black border-r-black";
const win95Title = "bg-[#0000A0] text-white font-bold px-2 py-0.5 flex justify-between items-center text-sm select-none";
const win95Button = "bg-[#c0c0c0] border-2 border-t-white border-l-white border-b-black border-r-black active:border-t-black active:border-l-black active:border-b-white active:border-r-white text-black px-4 py-1 text-xs font-bold cursor-pointer outline-none focus:outline-dotted focus:outline-1 focus:outline-black focus:-outline-offset-4 disabled:opacity-50";
const win95Input = "bg-white border-2 border-t-[#808080] border-l-[#808080] border-b-white border-r-white px-2 py-1 text-black text-xs outline-none focus:bg-[#0000A0] focus:text-white";
const desktopIcon = "flex flex-col items-center justify-start gap-1 p-2 w-20 text-white text-xs text-center cursor-pointer border border-transparent hover:border-white/50 focus:bg-[#0000A0] focus:border-[#0000A0] focus:outline-dotted focus:outline-1 focus:outline-yellow-400 select-none";
const win95Panel = "bg-[#c0c0c0] border-2 border-t-[#808080] border-l-[#808080] border-b-white border-r-white";

export default function VisorRemoto() {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const peerRef = useRef<RTCPeerConnection | null>(null);
    const dataChannelRef = useRef<RTCDataChannel | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const iceQueueRef = useRef<RTCIceCandidateInit[]>([]);
    const isSdpProcessingRef = useRef<boolean>(false);
    const streamRef = useRef<MediaStream | null>(null);
    
    const cierreSesionVoluntarioRef = useRef<boolean>(false);
    const audioCtxRef = useRef<AudioContext | any>(null);

    const [autenticado, setAutenticado] = useState<boolean>(false);
    const [token, setToken] = useState<string | null>(null);
    const [estado, setEstado] = useState<string>("C:\\>_ Esperando...");
    const [fps, setFps] = useState<number>(0);
    const [agenteOnline, setAgenteOnline] = useState<boolean | null>(null);
    const [verificando, setVerificando] = useState<boolean>(false);
    
    const [subiendoArchivo, setSubiendoArchivo] = useState<boolean>(false);
    const [progresoUpload, setProgresoUpload] = useState<number>(0);
    const uploadAbortControllerRef = useRef<AbortController | null>(null);

    const [mostrarModalPortapapeles, setMostrarModalPortapapeles] = useState<boolean>(false);
    const [textoPortapapeles, setTextoPortapapeles] = useState<string>("");
    
    const [mostrarModalRed, setMostrarModalRed] = useState<boolean>(false);
    const [tipoRed, setTipoRed] = useState<"dhcp" | "manual">("dhcp");
    const [ipManual, setIpManual] = useState<string>("");
    const [subnetManual, setSubnetManual] = useState<string>("255.255.255.0");
    const [gwManual, setGwManual] = useState<string>("");
    const [dnsManual, setDnsManual] = useState<string>("");

    const [urlNavegacion, setUrlNavegacion] = useState<string>("http://192.168.1.1");
    const [agenteDesconectadoError, setAgenteDesconectadoError] = useState<boolean>(false);

    const [backendHost, setBackendHost] = useState<string>("192.168.1.135:8080");
    const [sessionUuid, setSessionUuid] = useState<string>("88a29ec48f03"); 
    const [email, setEmail] = useState<string>(""); 

    const [vistaActiva, setVistaActiva] = useState<VistaApp>("desktop");
    const [hora, setHora] = useState<string>("");

    const PASSWORD_SECRETA = "TuContrasenaSeguraAqui";

    const lastMouseMove = useRef<number>(0);
    const frameCountRef = useRef<number>(0);
    const animationFrameIdRef = useRef<number | null>(null);

    const initAudio = () => {
        try {
            if (!audioCtxRef.current) {
                const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
                const ctx = new AudioContext();
                audioCtxRef.current = ctx;
            }
            const ctx = audioCtxRef.current;
            if (ctx.state === 'suspended') ctx.resume();

            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            gain.gain.value = 0;
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.001);
        } catch (e) { console.error("No se pudo precalentar el audio:", e); }
    };

    useEffect(() => {
        const interval = setInterval(() => {
            const date = new Date();
            setHora(date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }));
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    const verificarEstadoAgente = useCallback(async () => {
        if (!backendHost || !sessionUuid) { setAgenteOnline(false); return; }
        setVerificando(true);
        try {
            const res = await fetch(`https://${backendHost}/api/remote/session/${sessionUuid}/status`);
            if (res.ok) {
                const data = await res.json();
                setAgenteOnline(data.agente_online === true);
            } else { setAgenteOnline(false); }
        } catch (error) { 
            console.error("API Fetch Error (¿Certificado no aceptado?):", error);
            setAgenteOnline(false); 
        } 
        finally { setVerificando(false); }
    }, [backendHost, sessionUuid]); 

    useEffect(() => {
        verificarEstadoAgente();
    }, [verificarEstadoAgente]);

    useEffect(() => {
        if (!autenticado) return;
        const intervalId = setInterval(async () => {
            try {
                const res = await fetch(`https://${backendHost}/api/remote/session/${sessionUuid}/status`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.agente_online === false && !cierreSesionVoluntarioRef.current) {
                        setAgenteDesconectadoError(true);
                    }
                } else { 
                    if (!cierreSesionVoluntarioRef.current) setAgenteDesconectadoError(true); 
                }
            } catch (error) { 
                if (!cierreSesionVoluntarioRef.current) setAgenteDesconectadoError(true); 
            }
        }, 3000);
        return () => clearInterval(intervalId);
    }, [autenticado, backendHost, sessionUuid]);

    useEffect(() => {
        if (agenteDesconectadoError && audioCtxRef.current) {
            try {
                const ctx = audioCtxRef.current;
                if (ctx.state === 'suspended') ctx.resume();

                const freqs = [392.00, 493.88, 587.33];
                freqs.forEach(f => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = 'sine';
                    osc.frequency.value = f;
                    gain.gain.setValueAtTime(0, ctx.currentTime);
                    gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 0.05);
                    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5);
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.start();
                    osc.stop(ctx.currentTime + 1.5);
                });
            } catch (e) { console.error("Error reproduciendo alarma:", e); }
        }
    }, [agenteDesconectadoError]);

    const enviarComandoSistema = useCallback(async (action: string, params: any = {}) => {
        try {
            await fetch(`https://${backendHost}/api/remote/lite/command/${sessionUuid}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, params })
            });
        } catch (e) { console.error("SYS_ERR:", e); }
    }, [backendHost, sessionUuid]);

    const enviarComando = useCallback((comando: any) => {
        const payload = JSON.stringify(comando);
        if (dataChannelRef.current?.readyState === 'open') {
            dataChannelRef.current.send(payload);
        } else if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(payload);
        }
    }, []);

    useEffect(() => {
        const handleKD = (e: KeyboardEvent) => {
            if (vistaActiva !== "video" || agenteDesconectadoError) return;
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
            if (["Space", " ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) { e.preventDefault(); }
            enviarComando({ event: "key_down", key: e.key });
        };
        const handleKU = (e: KeyboardEvent) => {
            if (vistaActiva !== "video" || agenteDesconectadoError) return;
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
            enviarComando({ event: "key_up", key: e.key });
        };
        window.addEventListener('keydown', handleKD, { passive: false });
        window.addEventListener('keyup', handleKU, { passive: false });
        return () => { window.removeEventListener('keydown', handleKD); window.removeEventListener('keyup', handleKU); };
    }, [vistaActiva, agenteDesconectadoError, enviarComando]);

    const obtenerCoordenadasRelativas = (e: React.MouseEvent<HTMLVideoElement>): CoordenadasRelativas | null => {
        if (!videoRef.current) return null;
        const video = videoRef.current;
        const rect = video.getBoundingClientRect();
        if (video.videoWidth === 0 || video.videoHeight === 0) return null;

        const videoRatio = video.videoWidth / video.videoHeight;
        const elementRatio = rect.width / rect.height;
        let renderWidth, renderHeight, xOffset = 0, yOffset = 0;

        if (elementRatio > videoRatio) {
            renderHeight = rect.height;
            renderWidth = renderHeight * videoRatio;
            xOffset = (rect.width - renderWidth) / 2;
        } else {
            renderWidth = rect.width;
            renderHeight = renderWidth / videoRatio;
            yOffset = (rect.height - renderHeight) / 2;
        }

        const x_pixel = e.clientX - rect.left - xOffset;
        const y_pixel = e.clientY - rect.top - yOffset;
        if (x_pixel < 0 || x_pixel > renderWidth || y_pixel < 0 || y_pixel > renderHeight) return null;
        return { x: x_pixel, y: y_pixel, w: renderWidth, h: renderHeight };
    };

    const manejarMouseMove = (e: React.MouseEvent<HTMLVideoElement>) => {
        const ahora = Date.now();
        if (ahora - lastMouseMove.current < 33) return; 
        lastMouseMove.current = ahora;
        const coords = obtenerCoordenadasRelativas(e);
        if (coords) enviarComando({ event: "mouse_move", x_píxel: coords.x, y_píxel: coords.y, w_nativa: coords.w, h_nativa: coords.h });
    };

    const manejarMouseDown = (e: React.MouseEvent<HTMLVideoElement>) => {
        const coords = obtenerCoordenadasRelativas(e);
        if (coords) enviarComando({ event: "mouse_down", button: e.button === 2 ? "right" : "left", x_píxel: coords.x, y_píxel: coords.y, w_nativa: coords.w, h_nativa: coords.h });
    };

    const manejarMouseUp = (e: React.MouseEvent<HTMLVideoElement>) => {
        const coords = obtenerCoordenadasRelativas(e);
        if (coords) enviarComando({ event: "mouse_up", button: e.button === 2 ? "right" : "left", x_píxel: coords.x, y_píxel: coords.y, w_nativa: coords.w, h_nativa: coords.h });
    };

    const manejarScroll = (e: React.WheelEvent<HTMLVideoElement>) => {
        enviarComando({ event: "scroll", delta_x: Math.round(e.deltaX), delta_y: Math.round(-e.deltaY) });
    };

    const conectarAgente = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!agenteOnline || !email || !sessionUuid) return;
        initAudio(); 
        cierreSesionVoluntarioRef.current = false;
        
        try {
            setEstado("Autenticando API Segura...");
            const res = await fetch(`https://${backendHost}/api/remote/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: PASSWORD_SECRETA }) 
            });

            if (!res.ok) throw new Error("Auth Failed");
            const { access_token } = await res.json();
            setToken(access_token);

            setEstado("Despertando Agente...");
            await fetch(`https://${backendHost}/api/remote/session/${sessionUuid}/solicitar-conexion`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${access_token}` },
                body: JSON.stringify({ email: email }) 
            });

            setEstado("C:\\>_ CONECTANDO P2P...");
            setAutenticado(true);

            setTimeout(async () => {
                try {
                    await fetch(`https://${backendHost}/api/remote/lite/command/${sessionUuid}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: "init_p2p", params: {} })
                    });
                } catch (err) {}
            }, 1000);

        } catch (err: any) {
            setEstado(`FATAL: ${err.message}`);
        }
    };

    const contarFrames = useCallback(() => {
        if (videoRef.current && !videoRef.current.paused) frameCountRef.current++;
        animationFrameIdRef.current = requestAnimationFrame(contarFrames);
    }, []);

    useEffect(() => {
        if (autenticado && token) {
            const ws = new WebSocket(`wss://${backendHost}/api/remote/signaling/${sessionUuid}/visor?token=${token}`);
            wsRef.current = ws;

            ws.onclose = () => { if (!cierreSesionVoluntarioRef.current) setAgenteDesconectadoError(true); };

            ws.onmessage = async (event) => {
                const msg = JSON.parse(event.data);
                
                // 1. Rust nos dice que ya encendió FFmpeg y está listo para recibir
                if (msg.type_ === 'ready') {
                    console.log("✅ [SRA] Rust listo. Iniciando asalto WebRTC desde Chrome...");
                    iceQueueRef.current = [];
                    isSdpProcessingRef.current = true;

                    if (peerRef.current) { peerRef.current.close(); }
                    
                    const pc = new RTCPeerConnection({ 
                        iceServers: [ { urls: 'stun:stun.l.google.com:19302' } ] 
                    });
                    peerRef.current = pc;

                    pc.oniceconnectionstatechange = () => {
                        console.log("Estado ICE:", pc.iceConnectionState);
                        if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
                            setEstado("🟢 ENLACE P2P ESTABLECIDO");
                        } else if (pc.iceConnectionState === 'failed') {
                            setEstado("🔴 P2P BLOQUEADO");
                        }
                    };

                    pc.onicecandidate = (e) => {
                        if (e.candidate && ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({ ice: e.candidate }));
                        }
                    };

                    // 🔥 AHORA SÍ: El Visor CREA los canales y obliga a Rust a aceptarlos
                    pc.addTransceiver('video', { direction: 'recvonly' });
                    
                    const dc = pc.createDataChannel("control");
                    dc.onopen = () => console.log("✅ [DATOS] Canal abierto y asegurado por Chrome");
                    dataChannelRef.current = dc;

                    pc.ontrack = (e) => {
                        console.log("✅ [VIDEO] Track alineado y renderizando");
                        const stream = e.streams && e.streams.length > 0 ? e.streams[0] : new MediaStream([e.track]);
                        streamRef.current = stream;
                        
                        if (videoRef.current) {
                            videoRef.current.srcObject = stream;
                            videoRef.current.play().catch(err => console.warn("AutoPlay bloqueado:", err));
                        }
                        if (!animationFrameIdRef.current) contarFrames();
                    };

                    // Chrome genera la Oferta perfecta y se la manda a Rust
                    const offer = await pc.createOffer();
                    await pc.setLocalDescription(offer);
                    if (ws.readyState === WebSocket.OPEN && pc.localDescription) {
                        ws.send(JSON.stringify({ sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } }));
                    }

                // 2. Recibimos la Respuesta mansa de Rust y sellamos el trato
                } else if (msg.sdp && msg.sdp.type === 'answer') {
                    await peerRef.current?.setRemoteDescription(new RTCSessionDescription({ type: msg.sdp.type, sdp: msg.sdp.sdp }));
                    
                    isSdpProcessingRef.current = false;
                    for (const ice of iceQueueRef.current) {
                        try { await peerRef.current?.addIceCandidate(new RTCIceCandidate(ice)); } catch (e) {}
                    }
                    iceQueueRef.current = [];

                } else if (msg.ice) {
                    if (isSdpProcessingRef.current) { iceQueueRef.current.push(msg.ice); } 
                    else if (peerRef.current) { try { await peerRef.current.addIceCandidate(new RTCIceCandidate(msg.ice)); } catch (e) {} }
                }
            };
        }
    }, [autenticado, token, backendHost, sessionUuid, contarFrames]);

    useEffect(() => {
        if (vistaActiva === "video" && videoRef.current && streamRef.current) {
            videoRef.current.srcObject = streamRef.current;
            videoRef.current.play().catch(err => console.warn("AutoPlay bloqueado:", err));
        }
    }, [vistaActiva]);

    const abrirKiosco = () => {
        setVistaActiva("video");
        enviarComandoSistema("start_kiosk");
    };

    const manejarNavegacionManual = () => {
        if (urlNavegacion.trim() !== "") {
            enviarComando({ event: "navigate", text: urlNavegacion });
        }
    };

    const volverAlEscritorio = () => {
        if (vistaActiva === "video") {
            enviarComandoSistema("stop_kiosk");
            if (videoRef.current) { videoRef.current.srcObject = null; }
        }
        setVistaActiva("desktop");
    };
    
    const cerrarPopupYExpulsar = () => {
        setAgenteDesconectadoError(false);
        cerrarSesion();
    };

    const cerrarSesion = useCallback(() => {
        enviarComandoSistema("logout"); 
        
        cierreSesionVoluntarioRef.current = true;
        if (uploadAbortControllerRef.current) { uploadAbortControllerRef.current.abort(); uploadAbortControllerRef.current = null; }
        if (peerRef.current) { peerRef.current.close(); peerRef.current = null; }
        if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
        if (dataChannelRef.current) { dataChannelRef.current.close(); dataChannelRef.current = null; }
        if (animationFrameIdRef.current) { cancelAnimationFrame(animationFrameIdRef.current); animationFrameIdRef.current = null; }
        
        setFps(0);
        setEstado("C:\\>_ Desconectado.");
        setAutenticado(false);
        setToken(null);
        setVistaActiva("desktop");
    }, [enviarComandoSistema]);

    useEffect(() => {
        if (!autenticado) return;
        const fpsInterval = setInterval(() => { setFps(frameCountRef.current); frameCountRef.current = 0; }, 1000);
        return () => clearInterval(fpsInterval);
    }, [autenticado]);

    const manejarSubidaArchivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!dataChannelRef.current || dataChannelRef.current.readyState !== 'open') {
            alert("SYS_ERR: El túnel de datos P2P aún no está enlazado. Espere unos segundos e intente de nuevo.");
            if (fileInputRef.current) fileInputRef.current.value = "";
            return;
        }

        uploadAbortControllerRef.current = new AbortController();
        const signal = uploadAbortControllerRef.current.signal;

        setSubiendoArchivo(true);
        setProgresoUpload(0);

        try {
            enviarComando({ action: "start", filename: file.name, filesize: file.size });
            const chunkSize = 16384; 
            const bufferThreshold = 2 * 1024 * 1024; 
            let offset = 0;
            let lastUiUpdate = 0;

            while (offset < file.size) {
                if (signal.aborted) throw new Error("ABORT");

                if (dataChannelRef.current.bufferedAmount >= bufferThreshold) {
                    await new Promise(resolve => setTimeout(resolve, 5));
                    continue; 
                }

                const slice = file.slice(offset, offset + chunkSize);
                const chunk = await slice.arrayBuffer();
                dataChannelRef.current.send(chunk);
                offset += chunkSize;
                
                const currentPercent = Math.min(100, Math.floor((offset / file.size) * 100));
                if (currentPercent > lastUiUpdate) {
                    setProgresoUpload(currentPercent);
                    lastUiUpdate = currentPercent;
                }
            }

            if (!signal.aborted) {
                enviarComando({ action: "end" });
                setTimeout(() => {
                    setSubiendoArchivo(false);
                    setProgresoUpload(0);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                    uploadAbortControllerRef.current = null;
                }, 1000);
            }
        } catch (err: any) {
            if (err.message === "ABORT") enviarComando({ action: "cancel" }); 
            else alert(`I/O ERROR: ${err.message}`);
            
            setSubiendoArchivo(false);
            setProgresoUpload(0);
            if (fileInputRef.current) fileInputRef.current.value = "";
            uploadAbortControllerRef.current = null;
        }
    };

    const cancelarSubida = () => { if (uploadAbortControllerRef.current) uploadAbortControllerRef.current.abort(); };
    const sincronizarPortapapeles = () => { enviarComando({ event: "clipboard_sync", text: textoPortapapeles }); setMostrarModalPortapapeles(false); setTextoPortapapeles(""); };

    const aplicarConfiguracionRed = () => {
        if (tipoRed === "dhcp") {
            enviarComandoSistema("config_eth", { mode: "dhcp" });
        } else {
            const cidr = subnetManual.split('.').reduce((acc, octet) => {
                const b = parseInt(octet, 10).toString(2);
                return acc + (b.match(/1/g) || []).length;
            }, 0);
            
            const ipCidr = `${ipManual}/${cidr}`;
            enviarComandoSistema("config_eth", { mode: "manual", ip_cidr: ipCidr, gateway: gwManual, dns: dnsManual });
        }
        setMostrarModalRed(false);
    };

    return (
        <div className="bg-[#008080] w-screen h-screen flex flex-col font-mono text-black select-none overflow-hidden relative">
            {!autenticado && (
                <div className="flex-1 flex items-center justify-center bg-[#008080]">
                    <form onSubmit={conectarAgente} className={`${win95Window} w-[400px]`}>
                        <div className={win95Title}>
                            <span>Configuración de Red - SRA DOS</span>
                            <div className="bg-[#c0c0c0] text-black px-1.5 font-bold border-2 border-t-white border-l-white border-b-black border-r-black text-[10px] cursor-pointer active:border-t-black active:border-l-black active:border-b-white active:border-r-white">X</div>
                        </div>
                        <div className="p-4 flex flex-col gap-4">
                            <div className="flex items-center gap-4 mb-2">
                                <span className="text-4xl">🌐</span>
                                <div>
                                    <p className="font-bold text-sm">Bienvenido a SRA Link</p>
                                    <p className="text-xs">Escriba el ID del nodo para conectar.</p>
                                </div>
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs underline">Host (IP:Port):</label>
                                <input type="text" value={backendHost} onChange={(e) => { setBackendHost(e.target.value); setAgenteOnline(null); }} className={win95Input} />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs underline">UUID del Agente:</label>
                                <input type="text" value={sessionUuid} onChange={(e) => { setSessionUuid(e.target.value); setAgenteOnline(null); }} required className={win95Input} />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs underline">Email Operador:</label>
                                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className={win95Input} />
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                                <div className={`w-3 h-3 border border-black ${verificando ? 'bg-yellow-400' : agenteOnline ? 'bg-[#00ff00]' : 'bg-red-600'}`} />
                                <span className="text-xs font-bold">{verificando ? "Pinging..." : agenteOnline ? "Nodo ONLINE" : "Nodo OFFLINE / Bloqueo Cert."}</span>
                            </div>
                            <div className="flex justify-end gap-2 mt-4">
                                <button type="button" className={win95Button}>Cancelar</button>
                                <button type="submit" disabled={!agenteOnline || verificando || !email || !sessionUuid} className={win95Button}>Aceptar</button>
                            </div>
                        </div>
                    </form>
                </div>
            )}

            {autenticado && (
                <div className="flex-1 w-full h-full focus:outline-none relative" tabIndex={0}>
                    <div className="absolute top-4 left-4 flex flex-col gap-6">
                        <div tabIndex={0} onClick={() => setVistaActiva("terminal")} className={desktopIcon}>
                            <span className="text-4xl">C:\</span>
                            <span className="bg-blue-800 px-1">Minicom</span>
                        </div>
                        <div tabIndex={0} onClick={abrirKiosco} className={desktopIcon}>
                            <span className="text-4xl">🌐</span>
                            <span className="bg-blue-800 px-1">Web_Nav</span>
                        </div>
                        <div tabIndex={0} onClick={() => fileInputRef.current?.click()} className={desktopIcon}>
                            <span className="text-4xl">🗂️</span>
                            <span className="bg-blue-800 px-1">Upload.exe</span>
                        </div>
                        <div tabIndex={0} onClick={() => setMostrarModalRed(true)} className={desktopIcon}>
                            <span className="text-4xl">🔌</span>
                            <span className="bg-blue-800 px-1">NetConf</span>
                        </div>
                    </div>

                    {vistaActiva !== "desktop" && (
                        <div className="absolute top-8 left-28 right-8 bottom-16 flex flex-col z-10">
                            <div className={`${win95Window} w-full h-full flex flex-col shadow-[4px_4px_0_#000]`}>
                                <div className={win95Title}>
                                    <div className="flex items-center gap-2"><span>{vistaActiva === "video" ? "🌐 Web Navigator - Kiosco.exe" : "C:\\ SRA DOS Prompt - Minicom"}</span></div>
                                    <div className="flex gap-1">
                                        <button className="bg-[#c0c0c0] text-black px-1.5 font-bold border-2 border-t-white border-l-white border-b-black border-r-black text-[10px] active:border-t-black active:border-l-black active:border-b-white active:border-r-white">_</button>
                                        <button className="bg-[#c0c0c0] text-black px-1.5 font-bold border-2 border-t-white border-l-white border-b-black border-r-black text-[10px] active:border-t-black active:border-l-black active:border-b-white active:border-r-white">☐</button>
                                        <button onClick={volverAlEscritorio} className="bg-[#c0c0c0] text-black px-1.5 font-bold border-2 border-t-white border-l-white border-b-black border-r-black text-[10px] active:border-t-black active:border-l-black active:border-b-white active:border-r-white">X</button>
                                    </div>
                                </div>
                                <div className="bg-[#c0c0c0] px-2 py-1 flex gap-4 text-xs border-b border-[#808080]">
                                    <span className="underline cursor-pointer">F</span>ile
                                    <span className="underline cursor-pointer">E</span>dit
                                    <span className="underline cursor-pointer">V</span>iew
                                    <span className="underline cursor-pointer">H</span>elp
                                </div>
                                
                                {vistaActiva === "video" && (
                                    <div className="bg-[#c0c0c0] px-2 py-1 flex items-center gap-2 border-b border-[#808080]">
                                        <span className="text-xs font-bold">Dirección:</span>
                                        <input 
                                            type="text" 
                                            value={urlNavegacion}
                                            onChange={(e) => setUrlNavegacion(e.target.value)}
                                            onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') manejarNavegacionManual(); }}
                                            onKeyUp={(e) => e.stopPropagation()}
                                            className={`${win95Input} flex-1`} 
                                        />
                                        <button onClick={manejarNavegacionManual} className={win95Button}>Ir</button>
                                    </div>
                                )}

                                <div className={`flex-1 m-1 border-2 border-t-[#808080] border-l-[#808080] border-b-white border-r-white overflow-hidden bg-black relative`}>
                                    {vistaActiva === "video" && (
                                        <video 
                                            ref={videoRef} 
                                            autoPlay 
                                            playsInline 
                                            muted 
                                            onMouseMove={manejarMouseMove} 
                                            onMouseDown={manejarMouseDown} 
                                            onMouseUp={manejarMouseUp} 
                                            onWheel={manejarScroll} 
                                            onContextMenu={(e) => e.preventDefault()} 
                                            className="w-full h-full object-contain cursor-crosshair" 
                                            onClick={() => videoRef.current?.play()} 
                                        />
                                    )}
                                    {vistaActiva === "terminal" && (
                                        <div className="w-full h-full text-green-400 p-1"><TerminalLite uuid={sessionUuid} backendHost={backendHost} /></div>
                                    )}
                                </div>
                                <div className="bg-[#c0c0c0] flex justify-between text-[10px] px-2 py-0.5 border-t border-white">
                                    <span>Estado: {estado}</span>
                                    <span>{vistaActiva === "video" ? `FPS: ${fps}` : "COM1: OK"}</span>
                                </div>
                            </div>
                        </div>
                    )}
                    
                    {agenteDesconectadoError && (
                        <div className="absolute inset-0 flex items-center justify-center z-[9999] bg-black/50">
                            <div className={`${win95Window} w-[380px] shadow-[4px_4px_0_#000]`}>
                                <div className={win95Title}>
                                    <span>Error de Comunicación Fatal</span>
                                    <button onClick={cerrarPopupYExpulsar} className="bg-[#c0c0c0] text-black px-1.5 font-bold border-2 border-t-white border-l-white border-b-black border-r-black text-[10px] active:border-t-black active:border-l-black active:border-b-white active:border-r-white">X</button>
                                </div>
                                <div className="p-4 flex flex-col gap-4 bg-[#c0c0c0]">
                                    <div className="flex gap-4 items-center">
                                        <span className="text-4xl select-none">❌</span>
                                        <p className="text-sm font-bold">El agente remoto se ha desconectado de la red. La sesión ha sido terminada.</p>
                                    </div>
                                    <div className="flex justify-end mt-2">
                                        <button onClick={cerrarPopupYExpulsar} className={win95Button}>Aceptar</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {subiendoArchivo && (
                        <div className="absolute inset-0 flex items-center justify-center z-50">
                            <div className={`${win95Window} w-80 shadow-[4px_4px_0_#000]`}>
                                <div className={win95Title}><span>Copiando...</span></div>
                                <div className="p-4 flex flex-col gap-4">
                                    <div className="flex gap-4">
                                        <span className="text-3xl">📁</span>
                                        <div className="text-xs"><p>Copiando fichero a B:\TFTP_ROOT...</p></div>
                                    </div>
                                    <div className={win95Panel}><div className="bg-[#0000A0] h-4" style={{ width: `${progresoUpload}%` }}></div></div>
                                    <p className="text-center text-xs">{progresoUpload}% Completado</p>
                                    <div className="flex justify-center mt-2"><button onClick={cancelarSubida} className={win95Button}>Cancelar</button></div>
                                </div>
                            </div>
                        </div>
                    )}
                    <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={manejarSubidaArchivo}/>

                    <div className="absolute bottom-0 left-0 w-full h-8 bg-[#c0c0c0] border-t-2 border-white border-b-2 border-b-black flex items-center justify-between px-1 z-50 shadow-[0_-1px_2px_rgba(0,0,0,0.2)]">
                        <div className="flex items-center gap-1">
                            <button className="bg-[#c0c0c0] border-2 border-t-white border-l-white border-b-[#808080] border-r-[#808080] active:border-t-[#808080] active:border-l-[#808080] active:border-b-white active:border-r-white text-black px-2 h-6 flex items-center gap-1 font-bold text-xs">
                                <span className="text-red-500">❖</span> SRA
                            </button>
                            {vistaActiva !== "desktop" && (
                                <button onClick={volverAlEscritorio} className="bg-[#c0c0c0] border-2 border-t-[#808080] border-l-[#808080] border-b-white border-r-white text-black px-2 h-6 flex items-center gap-2 font-bold text-xs shadow-inner bg-white/20">
                                    {vistaActiva === "video" ? "🌐 Kiosco Web" : "C:\\ Minicom"}
                                </button>
                            )}
                        </div>
                        <div className="flex items-center gap-2 h-full">
                            <button onClick={() => setMostrarModalPortapapeles(true)} className="text-xs hover:underline px-1">📋 Portapapeles</button>
                            <button onClick={cerrarSesion} className="text-xs hover:underline px-1 text-red-700 font-bold">Cerrar Sesión</button>
                            <div className={`${win95Panel} px-2 h-6 flex items-center gap-2 text-xs ml-1 shadow-[inset_1px_1px_0_#808080]`}>
                                <div className={`w-2 h-2 rounded-full border border-[#808080] ${estado.includes("ESTABLECIDO") ? 'bg-[#00ff00]' : estado.includes("BLOQUEADO") ? 'bg-red-600' : 'bg-yellow-400'}`} />
                                <span>{hora}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {mostrarModalRed && (
                <div className="absolute inset-0 flex items-center justify-center z-[60]">
                    <div className={`${win95Window} w-[420px] shadow-[4px_4px_0_#000]`}>
                        <div className={win95Title}>
                            <span>Propiedades TCP/IP (eth0)</span>
                            <button onClick={() => setMostrarModalRed(false)} className="bg-[#c0c0c0] text-black px-1.5 font-bold border-2 border-t-white border-l-white border-b-black border-r-black text-[10px] active:border-t-black active:border-l-black active:border-b-white active:border-r-white">X</button>
                        </div>
                        <div className="p-4 flex flex-col gap-3 bg-[#c0c0c0]">
                            <div className="flex flex-col gap-1 border border-[#808080] p-2 bg-white/50">
                                <label className="text-xs font-bold mb-1">Configuración de Obtención de IP:</label>
                                <div className="flex items-center gap-2">
                                    <input 
                                        type="radio" 
                                        id="dhcp" 
                                        name="tipoRed" 
                                        checked={tipoRed === "dhcp"} 
                                        onChange={() => setTipoRed("dhcp")} 
                                    />
                                    <label htmlFor="dhcp" className="text-xs cursor-pointer">Obtener una dirección IP automáticamente (DHCP)</label>
                                </div>
                                <div className="flex items-center gap-2">
                                    <input 
                                        type="radio" 
                                        id="manual" 
                                        name="tipoRed" 
                                        checked={tipoRed === "manual"} 
                                        onChange={() => setTipoRed("manual")} 
                                    />
                                    <label htmlFor="manual" className="text-xs cursor-pointer">Usar la siguiente dirección IP (Estática)</label>
                                </div>
                            </div>

                            {tipoRed === "manual" && (
                                <div className="flex flex-col gap-2 border border-[#808080] p-2 bg-white/50">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs">Dirección IP:</span>
                                        <input type="text" value={ipManual} onChange={(e) => setIpManual(e.target.value)} placeholder="192.168.1.50" className={`${win95Input} w-52`} />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs">Máscara de Subred:</span>
                                        <input type="text" value={subnetManual} onChange={(e) => setSubnetManual(e.target.value)} placeholder="255.255.255.0" className={`${win95Input} w-52`} />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs">Puerta de enlace (GW):</span>
                                        <input type="text" value={gwManual} onChange={(e) => setGwManual(e.target.value)} placeholder="192.168.1.1" className={`${win95Input} w-52`} />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs">Servidor DNS:</span>
                                        <input type="text" value={dnsManual} onChange={(e) => setDnsManual(e.target.value)} placeholder="8.8.8.8" className={`${win95Input} w-52`} />
                                    </div>
                                </div>
                            )}

                            <div className="flex justify-end gap-2 mt-2">
                                <button onClick={aplicarConfiguracionRed} className={win95Button}>Aceptar</button>
                                <button onClick={() => setMostrarModalRed(false)} className={win95Button}>Cancelar</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}