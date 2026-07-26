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
    
    const [deviceType, setDeviceType] = useState<"heavy" | "lite">("heavy");
    const [esperandoAprobacion, setEsperandoAprobacion] = useState<boolean>(false);
    
    const [subiendoArchivo, setSubiendoArchivo] = useState<boolean>(false);
    const [progresoUpload, setProgresoUpload] = useState<number>(0);
    const uploadAbortControllerRef = useRef<AbortController | null>(null);
    
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
            const resApp = await fetch(`https://${backendHost}/api/app/status/${sessionUuid}`);
            if (resApp.ok) {
                const dataApp = await resApp.json();
                setDeviceType(dataApp.device_type || "heavy");
                setAgenteOnline(Boolean(dataApp.is_online));
            } else {
                setAgenteOnline(false);
            }
        } catch (error) { 
            console.error("API Fetch Error:", error);
            setAgenteOnline(false); 
        } 
        finally { setVerificando(false); }
    }, [backendHost, sessionUuid]); 

    useEffect(() => { verificarEstadoAgente(); }, [verificarEstadoAgente]);

    // 🔥 LOOP DE LA SALA DE ESPERA (Escuchando aprobación o rechazo del Admin)
    useEffect(() => {
        if (!esperandoAprobacion) return;

        const intervalId = setInterval(async () => {
            try {
                const res = await fetch(`https://${backendHost}/api/app/status/${sessionUuid}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.mfa_authorized) {
                        setEsperandoAprobacion(false);
                        setEstado("C:\\>_ APROBADO. El Sentinel ha lanzado el entorno. Conectando...");
                        setAutenticado(true);
                    } else if (String(data.operator_requested) === "false" || !data.operator_requested) {
                        // El administrador pulsó DENEGAR (eliminó la bandera en Redis)
                        setEsperandoAprobacion(false);
                        setEstado("ACCESO DENEGADO por el SRA Admin Center.");
                    }
                }
            } catch (e) { console.error(e); }
        }, 2000);

        return () => clearInterval(intervalId);
    }, [esperandoAprobacion, backendHost, sessionUuid]);

    useEffect(() => {
        if (!autenticado) return;
        let gracePeriod = true;
        setTimeout(() => { gracePeriod = false; }, 10000);

        const intervalId = setInterval(async () => {
            try {
                const res = await fetch(`https://${backendHost}/api/app/status/${sessionUuid}`);
                if (res.ok) {
                    const data = await res.json();
                    if (!data.is_online && !gracePeriod && !cierreSesionVoluntarioRef.current) {
                        setAgenteDesconectadoError(true);
                    }
                } else { 
                    if (!gracePeriod && !cierreSesionVoluntarioRef.current) setAgenteDesconectadoError(true); 
                }
            } catch (error) { 
                if (!gracePeriod && !cierreSesionVoluntarioRef.current) setAgenteDesconectadoError(true); 
            }
        }, 3000);
        
        return () => clearInterval(intervalId);
    }, [autenticado, backendHost, sessionUuid]);

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

    const conectarAgente = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!agenteOnline || !email || !sessionUuid) return;
        initAudio(); 
        cierreSesionVoluntarioRef.current = false;
        
        try {
            setVerificando(true);
            setEstado("Autenticando API Segura...");
            const resAuth = await fetch(`https://${backendHost}/api/remote/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: PASSWORD_SECRETA }) 
            });

            if (!resAuth.ok) throw new Error("Auth Failed");
            const { access_token } = await resAuth.json();
            setToken(access_token);

            const resStatus = await fetch(`https://${backendHost}/api/app/status/${sessionUuid}`);
            const dataStatus = await resStatus.json();

            setEstado("Llamando a la puerta...");
            
            // 🔥 INYECCIÓN DE LA SOLICITUD A LA API (Para el Admin Center)
            await fetch(`https://${backendHost}/api/app/request-access/${sessionUuid}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email }) 
            });

            if (dataStatus.mfa_authorized) {
                setEstado("C:\\>_ CONECTADO. Esperando órdenes...");
                setAutenticado(true);
            } else {
                setEstado("Esperando aprobación del administrador...");
                setEsperandoAprobacion(true);
            }

        } catch (err: any) {
            setEstado(`FATAL: ${err.message}`);
        } finally {
            setVerificando(false);
        }
    };

    const contarFrames = useCallback(() => {
        if (videoRef.current && !videoRef.current.paused) frameCountRef.current++;
        animationFrameIdRef.current = requestAnimationFrame(contarFrames);
    }, []);

    useEffect(() => {
        if (autenticado && token && vistaActiva === "video") {
            const ws = new WebSocket(`wss://${backendHost}/api/remote/signaling/${sessionUuid}/visor?token=${token}`);
            wsRef.current = ws;

            ws.onclose = () => { console.log("ℹ️ [SEÑALIZACIÓN] Socket cerrado intencionadamente."); };

            ws.onmessage = async (event) => {
                const msg = JSON.parse(event.data);
                if (msg.type_ === 'ready') {
                    iceQueueRef.current = [];
                    isSdpProcessingRef.current = true;
                    if (peerRef.current) { peerRef.current.close(); }
                    
                    const pc = new RTCPeerConnection({ iceServers: [ { urls: 'stun:stun.l.google.com:19302' } ] });
                    peerRef.current = pc;

                    pc.oniceconnectionstatechange = () => {
                        if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') { setEstado("🟢 ENLACE P2P ESTABLECIDO"); } 
                        else if (pc.iceConnectionState === 'failed') { setEstado("🔴 P2P BLOQUEADO"); }
                    };

                    pc.onicecandidate = (e) => { if (e.candidate && ws.readyState === WebSocket.OPEN) { ws.send(JSON.stringify({ ice: e.candidate })); } };
                    pc.addTransceiver('video', { direction: 'recvonly' });
                    
                    const dc = pc.createDataChannel("control");
                    dataChannelRef.current = dc;

                    pc.ontrack = (e) => {
                        const stream = e.streams && e.streams.length > 0 ? e.streams[0] : new MediaStream([e.track]);
                        streamRef.current = stream;
                        if (videoRef.current) {
                            videoRef.current.srcObject = stream;
                            videoRef.current.play().catch(err => console.warn("AutoPlay bloqueado:", err));
                        }
                        if (!animationFrameIdRef.current) contarFrames();
                    };

                    const offer = await pc.createOffer();
                    await pc.setLocalDescription(offer);
                    if (ws.readyState === WebSocket.OPEN && pc.localDescription) {
                        ws.send(JSON.stringify({ sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } }));
                    }

                } else if (msg.sdp && msg.sdp.type === 'answer') {
                    await peerRef.current?.setRemoteDescription(new RTCSessionDescription({ type: msg.sdp.type, sdp: msg.sdp.sdp }));
                    isSdpProcessingRef.current = false;
                    for (const ice of iceQueueRef.current) { try { await peerRef.current?.addIceCandidate(new RTCIceCandidate(ice)); } catch (e) {} }
                    iceQueueRef.current = [];
                } else if (msg.ice) {
                    if (isSdpProcessingRef.current) { iceQueueRef.current.push(msg.ice); } 
                    else if (peerRef.current) { try { await peerRef.current.addIceCandidate(new RTCIceCandidate(msg.ice)); } catch (e) {} }
                }
            };
            return () => { ws.close(); wsRef.current = null; };
        }
    }, [autenticado, token, backendHost, sessionUuid, contarFrames, vistaActiva]);

    useEffect(() => {
        if (vistaActiva === "video" && videoRef.current && streamRef.current) {
            videoRef.current.srcObject = streamRef.current;
            videoRef.current.play().catch(e => console.warn(e));
        }
    }, [vistaActiva]);

    const abrirKiosco = () => {
        setVistaActiva("video");
        setEstado("C:\\>_ Levantando Túnel Pesado...");
        enviarComandoSistema("init_p2p");
        setTimeout(() => enviarComandoSistema("start_kiosk"), 2000);
    };

    const volverAlEscritorio = () => {
        enviarComandoSistema("kill_all"); 
        if (videoRef.current) { videoRef.current.srcObject = null; }
        setVistaActiva("desktop");
        setEstado("C:\\>_ Procesos detenidos. (0% CPU)");
        setFps(0);
    };
    
    const cerrarPopupYExpulsar = () => {
        setAgenteDesconectadoError(false);
        cerrarSesion();
    };

    const cerrarSesion = useCallback(() => {
        enviarComandoSistema("logout"); 
        
        // 🔥 LIMPIAMOS LA BATISEÑAL EN EL SERVIDOR PARA QUE EL SENTINEL MATE EL PROCESO
        fetch(`https://${backendHost}/api/app/close-access/${sessionUuid}`, { method: 'POST' }).catch(() => {});
        
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
    }, [enviarComandoSistema, backendHost, sessionUuid]);

    // Resto de la UI (Pantalla de login, sala de espera, etc...)
    return (
        <div className="bg-[#008080] w-screen h-screen flex flex-col font-mono text-black select-none overflow-hidden relative">
            {!autenticado && !esperandoAprobacion && (
                <div className="flex-1 flex items-center justify-center bg-[#008080]">
                    <form onSubmit={conectarAgente} className={`${win95Window} w-[400px]`}>
                        <div className={win95Title}><span>Terminal de Acceso SRA</span></div>
                        <div className="p-4 flex flex-col gap-4">
                            <div className="flex items-center gap-4 mb-2">
                                <span className="text-4xl">🌐</span>
                                <div><p className="font-bold text-sm">Bienvenido a SRA Link</p><p className="text-xs">Escriba el ID del nodo para conectar.</p></div>
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs underline">Host (IP:Port):</label>
                                <input type="text" value={backendHost} onChange={(e) => setBackendHost(e.target.value)} className={win95Input} />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs underline">UUID del Agente:</label>
                                <input type="text" value={sessionUuid} onChange={(e) => setSessionUuid(e.target.value)} required className={win95Input} />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs underline">Email Operador:</label>
                                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className={win95Input} />
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                                <div className={`w-3 h-3 border border-black ${verificando ? 'bg-yellow-400' : agenteOnline ? 'bg-[#00ff00]' : 'bg-red-600'}`} />
                                <span className="text-xs font-bold">{verificando ? "Pinging..." : agenteOnline ? `Nodo ONLINE (${deviceType})` : "Nodo OFFLINE / Bloqueo"}</span>
                            </div>
                            <div className="flex justify-end gap-2 mt-4">
                                <button type="button" className={win95Button}>Cancelar</button>
                                <button type="submit" disabled={!agenteOnline || verificando || !email || !sessionUuid} className={win95Button}>Conectar</button>
                            </div>
                            <div className="text-center mt-2"><span className="text-[10px] text-gray-700">{estado}</span></div>
                        </div>
                    </form>
                </div>
            )}

            {!autenticado && esperandoAprobacion && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-[9999]">
                    <div className={`${win95Window} w-[380px] shadow-[4px_4px_0_#000]`}>
                        <div className={win95Title}><span>SRA Security Policy</span></div>
                        <div className="p-6 flex flex-col items-center gap-4 bg-[#c0c0c0]">
                            <span className="text-4xl animate-pulse">⏳</span>
                            <p className="font-bold text-sm text-center">Esperando autorización...</p>
                            <p className="text-xs text-center">La política Zero-Trust requiere que el administrador apruebe esta conexión en el SRA Center.</p>
                            <button onClick={() => setEsperandoAprobacion(false)} className={`${win95Button} mt-2`}>Cancelar Solicitud</button>
                        </div>
                    </div>
                </div>
            )}

            {autenticado && (
                <div className="flex-1 w-full h-full focus:outline-none relative" tabIndex={0}>
                    <div className="absolute top-4 left-4 flex flex-col gap-6">
                        <div tabIndex={0} className={desktopIcon}><span className="text-4xl">C:\</span><span className="bg-blue-800 px-1">Minicom</span></div>
                        {deviceType === "heavy" && (<div tabIndex={0} onClick={abrirKiosco} className={desktopIcon}><span className="text-4xl">🌐</span><span className="bg-blue-800 px-1">Web_Nav</span></div>)}
                    </div>
                    {vistaActiva !== "desktop" && (
                        <div className="absolute top-8 left-28 right-8 bottom-16 flex flex-col z-10">
                            <div className={`${win95Window} w-full h-full flex flex-col shadow-[4px_4px_0_#000]`}>
                                <div className={win95Title}>
                                    <div className="flex items-center gap-2"><span>🌐 SRA Gráfico</span></div>
                                    <button onClick={volverAlEscritorio} className="bg-[#c0c0c0] text-black px-1.5 font-bold border-2 border-t-white border-l-white border-b-black border-r-black text-[10px] active:border-t-black active:border-l-black active:border-b-white active:border-r-white">X</button>
                                </div>
                                <div className={`flex-1 m-1 border-2 border-t-[#808080] border-l-[#808080] border-b-white border-r-white overflow-hidden bg-black relative`}>
                                    <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-contain cursor-crosshair" />
                                </div>
                                <div className="bg-[#c0c0c0] flex justify-between text-[10px] px-2 py-0.5 border-t border-white">
                                    <span>Estado: {estado}</span><span>FPS: {fps}</span>
                                </div>
                            </div>
                        </div>
                    )}
                    <div className="absolute bottom-0 left-0 w-full h-8 bg-[#c0c0c0] border-t-2 border-white border-b-2 border-b-black flex items-center justify-between px-1 z-50 shadow-[0_-1px_2px_rgba(0,0,0,0.2)]">
                        <button className="bg-[#c0c0c0] border-2 border-t-white border-l-white border-b-[#808080] border-r-[#808080] text-black px-2 h-6 flex items-center gap-1 font-bold text-xs"><span className="text-red-500">❖</span> SRA</button>
                        <div className="flex items-center gap-2 h-full">
                            <button onClick={cerrarSesion} className="text-xs hover:underline px-1 text-red-700 font-bold">Cerrar Sesión</button>
                            <div className={`${win95Panel} px-2 h-6 flex items-center gap-2 text-xs ml-1 shadow-[inset_1px_1px_0_#808080]`}><div className={`w-2 h-2 rounded-full border border-[#808080] bg-[#00ff00]`} /><span>{hora}</span></div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}