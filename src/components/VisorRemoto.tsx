import React, { useEffect, useRef, useState, useCallback } from 'react';
import TerminalLite from './TerminalLite.tsx'; 

interface CoordenadasRelativas { x: number; y: number; w: number; h: number; }
type VistaApp = "desktop" | "video" | "terminal";
type TftpFase = "inactiva" | "staging" | "transfiriendo";

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
    
    const iceQueueRef = useRef<RTCIceCandidateInit[]>([]);
    const isSdpProcessingRef = useRef<boolean>(false);
    const streamRef = useRef<MediaStream | null>(null);
    
    const cierreSesionVoluntarioRef = useRef<boolean>(false);
    const fallosConsecutivos = useRef<number>(0);
    const audioCtxRef = useRef<any>(null);

    const [autenticado, setAutenticado] = useState<boolean>(false);
    const [token, setToken] = useState<string | null>(null);
    const [estado, setEstado] = useState<string>("C:\\>_ Esperando...");
    const [fps, setFps] = useState<number>(0);
    const [agenteOnline, setAgenteOnline] = useState<boolean | null>(null);
    const [verificando, setVerificando] = useState<boolean>(false);
    
    const [deviceType, setDeviceType] = useState<string>("heavy");
    const [esperandoAprobacion, setEsperandoAprobacion] = useState<boolean>(false);
    
    // Estados de Red
    const [mostrarModalRed, setMostrarModalRed] = useState<boolean>(false);
    const [modoNetConf, setModoNetConf] = useState<string>("web"); 
    const [tipoRed, setTipoRed] = useState<string>("dhcp");
    const [ipManual, setIpManual] = useState<string>("");
    const [subnetManual, setSubnetManual] = useState<string>("255.255.255.0");
    const [gwManual, setGwManual] = useState<string>("");
    const [dnsManual, setDnsManual] = useState<string>(""); 
    
    const [tftpConfigured, setTftpConfigured] = useState<boolean>(false);

    // Estados de Subida TFTP
    const [mostrarModalUpload, setMostrarModalUpload] = useState<boolean>(false);
    const [uploadOs, setUploadOs] = useState<string>("cisco");
    const [subiendoArchivo, setSubiendoArchivo] = useState<boolean>(false);
    const [progresoUpload, setProgresoUpload] = useState<number>(0);
    const uploadAbortControllerRef = useRef<AbortController | null>(null);

    // Fases del TFTP
    const [tftpFase, setTftpFase] = useState<TftpFase>("inactiva");
    const [tftpStagingFile, setTftpStagingFile] = useState<string | null>(null);

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
                const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
                const ctx = new AudioContextClass();
                audioCtxRef.current = ctx;
            }
            const ctx = audioCtxRef.current;
            if (!ctx) return;
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
            setAgenteOnline(false); 
        } 
        finally { setVerificando(false); }
    }, [backendHost, sessionUuid]); 

    useEffect(() => { verificarEstadoAgente(); }, [verificarEstadoAgente]);

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
        setTimeout(() => { gracePeriod = false; }, 8000);

        const intervalId = setInterval(async () => {
            if (cierreSesionVoluntarioRef.current) return;

            try {
                const res = await fetch(`https://${backendHost}/api/app/status/${sessionUuid}`);
                if (res.ok) {
                    const data = await res.json();
                    if (!data.is_online && !gracePeriod) {
                        fallosConsecutivos.current += 1;
                        if (fallosConsecutivos.current >= 3) {
                            setAgenteDesconectadoError(true);
                        }
                    } else {
                        fallosConsecutivos.current = 0;
                    }
                } else { 
                    if (!gracePeriod) {
                        fallosConsecutivos.current += 1;
                        if (fallosConsecutivos.current >= 3) setAgenteDesconectadoError(true); 
                    }
                }
            } catch (error) { 
                if (!gracePeriod) {
                    fallosConsecutivos.current += 1;
                    if (fallosConsecutivos.current >= 3) setAgenteDesconectadoError(true); 
                }
            }
        }, 2000);
        
        return () => clearInterval(intervalId);
    }, [autenticado, backendHost, sessionUuid]);

    useEffect(() => {
        if (agenteDesconectadoError && audioCtxRef.current) {
            try {
                const ctx = audioCtxRef.current;
                if (!ctx) return;
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
            } catch (e) {}
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

    // 🔥 INTERCEPTOR INFALIBLE: Si el usuario recarga la página (F5) o cierra la pestaña 🔥
    useEffect(() => {
        const handleUnload = () => {
            if (autenticado && backendHost && sessionUuid) {
                // 1. Petición POST vacía SIN Body: Evita el bloqueo de CORS Preflight en F5
                // Esto borra el operator_req de Redis de forma instantánea.
                fetch(`https://${backendHost}/api/app/close-access/${sessionUuid}`, { 
                    method: 'POST', 
                    keepalive: true 
                }).catch(() => {});
                
                // 2. Disparo de emergencia al agente
                fetch(`https://${backendHost}/api/remote/lite/command/${sessionUuid}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: "logout", params: {} }),
                    keepalive: true
                }).catch(() => {});
            }
        };

        window.addEventListener('beforeunload', handleUnload);
        window.addEventListener('unload', handleUnload);
        return () => {
            window.removeEventListener('beforeunload', handleUnload);
            window.removeEventListener('unload', handleUnload);
        };
    }, [autenticado, backendHost, sessionUuid]);

    const enviarComando = useCallback((comando: any) => {
        const payload = JSON.stringify(comando);
        if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
            dataChannelRef.current.send(payload);
        } else if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
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
        fallosConsecutivos.current = 0; 
        
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
            let isCleaningUp = false; 
            
            const ws = new WebSocket(`wss://${backendHost}/api/remote/signaling/${sessionUuid}/visor?token=${token}`);
            wsRef.current = ws;

            ws.onclose = () => { console.log("ℹ️ [SEÑALIZACIÓN] Socket cerrado."); };

            ws.onmessage = async (event: MessageEvent) => {
                const msg = JSON.parse(event.data);
                if (msg.type_ === 'ready') {
                    iceQueueRef.current = [];
                    isSdpProcessingRef.current = true;
                    if (peerRef.current) { peerRef.current.close(); }
                    
                    const pc = new RTCPeerConnection({ iceServers: [ { urls: 'stun:stun.l.google.com:19302' } ] });
                    peerRef.current = pc;

                    pc.oniceconnectionstatechange = () => {
                        if (isCleaningUp) return; 
                        
                        if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') { 
                            setEstado("🟢 ENLACE P2P ESTABLECIDO"); 
                        } 
                        else if (pc.iceConnectionState === 'disconnected') {
                            setEstado("⚠️ INTERFERENCIA RED. Recuperando P2P...");
                        }
                        else if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') { 
                            setEstado("🔴 P2P FALLIDO. Reconexión imposible."); 
                            if (!cierreSesionVoluntarioRef.current) {
                                setAgenteDesconectadoError(true);
                            }
                        }
                    };

                    pc.onicecandidate = (e: RTCPeerConnectionIceEvent) => { if (e.candidate && ws.readyState === WebSocket.OPEN) { ws.send(JSON.stringify({ ice: e.candidate })); } };
                    pc.addTransceiver('video', { direction: 'recvonly' });
                    
                    const dc = pc.createDataChannel("control");
                    dc.onopen = () => console.log("✅ [DATOS] Canal asegurado.");
                    dataChannelRef.current = dc;

                    pc.ontrack = (e: RTCTrackEvent) => {
                        const stream = e.streams && e.streams.length > 0 ? e.streams[0] : new MediaStream([e.track]);
                        streamRef.current = stream;
                        if (videoRef.current) {
                            videoRef.current.srcObject = stream;
                            videoRef.current.play().catch(err => console.warn("AutoPlay bloqueado:", err));
                            videoRef.current.focus(); 
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
            
            return () => { 
                isCleaningUp = true;
                if (peerRef.current) { peerRef.current.close(); peerRef.current = null; }
                if (dataChannelRef.current) { dataChannelRef.current.close(); dataChannelRef.current = null; }
                ws.close(); wsRef.current = null; 
            };
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
        setTimeout(() => enviarComandoSistema("start_kiosk", { url: urlNavegacion }), 2000);
    };

    const abrirMinicom = () => {
        setVistaActiva("terminal");
        setEstado("C:\\>_ Enlazando Terminal Serie Web...");
    };

    const volverAlEscritorio = () => {
        enviarComandoSistema("stop_kiosk"); 
        
        if (peerRef.current) { peerRef.current.close(); peerRef.current = null; }
        if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
        if (dataChannelRef.current) { dataChannelRef.current.close(); dataChannelRef.current = null; }
        if (animationFrameIdRef.current) { cancelAnimationFrame(animationFrameIdRef.current); animationFrameIdRef.current = null; }
        if (videoRef.current) { videoRef.current.srcObject = null; }
        
        setVistaActiva("desktop");
        setEstado("C:\\>_ Kiosco y túnel de vídeo cerrados. CPU liberada.");
        setFps(0);
    };
    
    const cerrarPopupYExpulsar = () => {
        setAgenteDesconectadoError(false);
        cerrarSesion();
    };

    // 🔥 BOTÓN CERRAR SESIÓN ROBUSTO CON ASYNC/AWAIT
    const cerrarSesion = useCallback(async () => {
        setEstado("C:\\>_ Liberando hardware de red...");
        
        if (tftpStagingFile) {
            await enviarComandoSistema("delete_tftp_file", { filename: tftpStagingFile });
        }

        await enviarComandoSistema("logout"); 
        
        try {
            // Hacemos un POST vacío. Sin JSON, directo al backend
            await fetch(`https://${backendHost}/api/app/close-access/${sessionUuid}`, { 
                method: 'POST',
                keepalive: true
            });
        } catch (e) {
            console.warn("La liberación forzada falló.");
        }
        
        cierreSesionVoluntarioRef.current = true;
        if (uploadAbortControllerRef.current) { uploadAbortControllerRef.current.abort(); uploadAbortControllerRef.current = null; }
        if (peerRef.current) { peerRef.current.close(); peerRef.current = null; }
        if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
        if (dataChannelRef.current) { dataChannelRef.current.close(); dataChannelRef.current = null; }
        if (animationFrameIdRef.current) { cancelAnimationFrame(animationFrameIdRef.current); animationFrameIdRef.current = null; }
        if (videoRef.current) { videoRef.current.srcObject = null; }
        
        setFps(0);
        setEstado("C:\\>_ Desconectado.");
        setAutenticado(false);
        setToken(null);
        setVistaActiva("desktop");
    }, [enviarComandoSistema, backendHost, sessionUuid, tftpStagingFile]);

    const abrirMenuUpload = () => {
        if (!tftpConfigured) {
            setEstado("C:\\>_ [BLOQUEO] Debes configurar la IP de TFTP en NetConf primero.");
            return;
        }
        setMostrarModalUpload(true);
    };

    const manejarSubidaYMacro = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        uploadAbortControllerRef.current = new AbortController();
        const signal = uploadAbortControllerRef.current.signal;
        setSubiendoArchivo(true);
        setProgresoUpload(0);
        setEstado(`C:\\>_ Preparando túnel TFTP para ${file.name}...`);

        try {
            const wsUrl = `wss://${backendHost}/api/remote/lite/web/${sessionUuid}?token=${token || ""}`;
            const ws = new WebSocket(wsUrl);

            ws.onopen = async () => {
                setEstado(`C:\\>_ Túnel activo. Subiendo archivo al TFTP Local...`);
                await enviarComandoSistema("start_file_transfer", { filename: file.name, size: file.size });

                setTimeout(() => {
                    const chunkSize = 64 * 1024;
                    let offset = 0;
                    let lastUiUpdate = 0;

                    const readNextChunk = () => {
                        if (signal.aborted) {
                            ws.close();
                            throw new Error("ABORT");
                        }
                        const slice = file.slice(offset, offset + chunkSize);
                        const reader = new FileReader();
                        
                        reader.onload = (evt: ProgressEvent<FileReader>) => {
                            if (ws.readyState === WebSocket.OPEN && evt.target?.result) {
                                ws.send(evt.target.result as ArrayBuffer);
                            }
                            
                            offset += chunkSize;
                            const currentPercent = Math.min(100, Math.floor((offset / file.size) * 100));
                            if (currentPercent > lastUiUpdate) {
                                setProgresoUpload(currentPercent);
                                lastUiUpdate = currentPercent;
                            }

                            if (offset < file.size) {
                                setTimeout(readNextChunk, 5);
                            } else {
                                enviarComandoSistema("end_file_transfer", {});
                                setEstado(`C:\\>_ Archivo en Raspberry. Iniciando TFTP hacia el router...`);
                                
                                enviarComandoSistema("macro_tftp_download", { filename: file.name, os: uploadOs, raspi_ip: ipManual || "192.168.1.135" });
                                
                                setTftpStagingFile(file.name);
                                setTftpFase("transfiriendo");
                                setSubiendoArchivo(false);
                                uploadAbortControllerRef.current = null;
                                ws.close();
                            }
                        };
                        reader.readAsArrayBuffer(slice);
                    };

                    readNextChunk();
                }, 500);
            };

            ws.onerror = () => { throw new Error("Fallo en la conexión del túnel."); };

        } catch (err: any) {
            if (err.message === "ABORT") enviarComandoSistema("cancel_file_transfer"); 
            else alert(`ERROR DE RED: ${err.message}`);
            
            setSubiendoArchivo(false); 
            setProgresoUpload(0);
            setEstado("C:\\>_ Error en la transferencia.");
            uploadAbortControllerRef.current = null;
        }
    };

    const cancelarSubida = () => { if (uploadAbortControllerRef.current) uploadAbortControllerRef.current.abort(); };

    const aplicarConfiguracionRed = () => {
        if (tipoRed === "dhcp") {
            enviarComandoSistema("config_eth", { mode: "dhcp" });
        } else {
            const cleanIp = ipManual.trim();
            const cleanSubnet = subnetManual.trim();
            const cleanGw = gwManual.trim();
            const cleanDns = dnsManual.trim();
            const cidr = cleanSubnet.split('.').reduce((acc: number, octet: string) => {
                const b = parseInt(octet, 10);
                if (isNaN(b)) return acc;
                return acc + (b.toString(2).match(/1/g) || []).length;
            }, 0);
            
            const ipCidr = `${cleanIp}/${cidr}`;
            enviarComandoSistema("config_eth", { mode: "manual", ip_cidr: ipCidr, gateway: cleanGw, dns: cleanDns }); 
        }

        if (modoNetConf === "tftp") {
            setTftpConfigured(true);
            enviarComandoSistema("config_tftp", {}); 
        } else {
            setTftpConfigured(false);
        }

        setEstado(`C:\\>_ Configuración aplicada en modo: ${modoNetConf.toUpperCase()}`);
        setMostrarModalRed(false);
    };

    const finalizarYLimpiarTFTP = () => {
        if (tftpStagingFile) {
            enviarComandoSistema("delete_tftp_file", { filename: tftpStagingFile });
            setTftpStagingFile(null);
        }
        setTftpFase("inactiva");
        setMostrarModalUpload(false);
        setEstado(`C:\\>_ Transferencia completada y archivo vaporizado de forma segura.`);
    };

    const navegarUrl = () => {
        if (!urlNavegacion.trim()) return;
        setEstado(`C:\\>_ Navegando a ${urlNavegacion}...`);
        enviarComandoSistema("start_kiosk", { url: urlNavegacion });
    };

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
                                <button type="submit" disabled={!agenteOnline || verificando || !email || !sessionUuid || esperandoAprobacion} className={win95Button}>
                                    {esperandoAprobacion ? 'Solicitando...' : 'Conectar'}
                                </button>
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
                        <div tabIndex={0} onClick={abrirMinicom} className={desktopIcon}>
                            <span className="text-4xl">C:\</span>
                            <span className="bg-blue-800 px-1">Minicom</span>
                        </div>
                        {deviceType === "heavy" && (
                            <div tabIndex={0} onClick={abrirKiosco} className={desktopIcon}>
                                <span className="text-4xl">🌐</span>
                                <span className="bg-blue-800 px-1">Web_Nav</span>
                            </div>
                        )}
                        <div 
                            tabIndex={tftpConfigured ? 0 : -1} 
                            onClick={tftpConfigured ? abrirMenuUpload : () => setEstado("C:\\>_ [BLOQUEO] Configura primero la IP TFTP en NetConf.")} 
                            className={`flex flex-col items-center justify-start gap-1 p-2 w-20 text-white text-xs text-center border border-transparent select-none ${tftpConfigured ? 'cursor-pointer hover:border-white/50 focus:bg-[#0000A0] focus:border-[#0000A0] focus:outline-dotted focus:outline-1 focus:outline-yellow-400' : 'opacity-40 grayscale cursor-not-allowed'}`}
                        >
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
                                    <div className="flex items-center gap-2"><span>🌐 SRA Gráfico</span></div>
                                    <button onClick={volverAlEscritorio} className="bg-[#c0c0c0] text-black px-1.5 font-bold border-2 border-t-white border-l-white border-b-black border-r-black text-[10px] active:border-t-black active:border-l-black active:border-b-white active:border-r-white">X</button>
                                </div>
                                <div className={`flex-1 m-1 border-2 border-t-[#808080] border-l-[#808080] border-b-white border-r-white overflow-hidden bg-black flex flex-col relative`}>
                                    
                                    {vistaActiva === "video" && (
                                        <div className="bg-[#c0c0c0] p-1 flex items-center gap-2 border-b-2 border-black w-full shrink-0">
                                            <span className="text-xs font-bold pl-1 text-black">Dirección:</span>
                                            <input 
                                                type="text" 
                                                value={urlNavegacion} 
                                                onChange={(e) => setUrlNavegacion(e.target.value)}
                                                onKeyDown={(e) => {
                                                    e.stopPropagation(); 
                                                    if (e.key === 'Enter') navegarUrl();
                                                }}
                                                onFocus={(e) => e.target.select()}
                                                className={`${win95Input} flex-1 text-black font-sans`}
                                                placeholder="http://192.168.1.1"
                                            />
                                            <button onClick={navegarUrl} className={`${win95Button} py-0 h-6 leading-none`}>Ir</button>
                                        </div>
                                    )}

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
                                            className="w-full flex-1 object-contain cursor-crosshair focus:outline-none" 
                                            tabIndex={0}
                                        />
                                    )}
                                    {vistaActiva === "terminal" && (
                                        <div className="w-full h-full text-green-400 p-1">
                                            <TerminalLite uuid={sessionUuid} backendHost={backendHost} token={token || ""} />
                                        </div>
                                    )}
                                </div>
                                <div className="bg-[#c0c0c0] flex justify-between text-[10px] px-2 py-0.5 border-t border-white">
                                    <span>Estado: {estado}</span><span>FPS: {fps}</span>
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
                                        <p className="text-sm font-bold">El agente remoto ha perdido la señal P2P o el equipo se ha desconectado de la red.</p>
                                    </div>
                                    <div className="flex justify-end mt-2">
                                        <button onClick={cerrarPopupYExpulsar} className={win95Button}>Aceptar</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {mostrarModalUpload && (
                        <div className="absolute inset-0 flex items-center justify-center z-[60] bg-black/50">
                            <div className={`${win95Window} w-[420px] shadow-[4px_4px_0_#000]`}>
                                <div className={win95Title}>
                                    <span>Aprovisionamiento TFTP Zero-Touch</span>
                                    {tftpFase === "inactiva" && (
                                        <button onClick={() => setMostrarModalUpload(false)} className="bg-[#c0c0c0] text-black px-1.5 font-bold border-2 border-t-white border-l-white border-b-black border-r-black text-[10px] active:border-t-black active:border-l-black active:border-b-white active:border-r-white">X</button>
                                    )}
                                </div>
                                
                                <div className="p-4 flex flex-col gap-4 bg-[#c0c0c0]">
                                    {tftpFase === "inactiva" && (
                                        <>
                                            <div className="flex flex-col gap-1">
                                                <label className="text-xs font-bold">Sistema Operativo Destino:</label>
                                                <select 
                                                    value={uploadOs} 
                                                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setUploadOs(e.target.value)} 
                                                    className={`${win95Input} w-full`}
                                                >
                                                    <option value="cisco">Cisco (copy tftp...)</option>
                                                    <option value="fortinet">Fortinet (execute restore...)</option>
                                                    <option value="paloalto">PaloAlto (tftp import...)</option>
                                                </select>
                                            </div>
                                            
                                            <div className="border border-[#808080] p-3 bg-white/50 text-center">
                                                <label className={`${win95Button} block cursor-pointer`}>
                                                    SELECCIONAR ARCHIVO Y AUTO-INYECTAR
                                                    <input 
                                                        type="file" 
                                                        className="hidden" 
                                                        onChange={manejarSubidaYMacro}
                                                    />
                                                </label>
                                            </div>
                                            <p className="text-[10px] text-gray-700 italic">
                                                Al seleccionar, el archivo se transferirá e inyectará automáticamente en el router.
                                            </p>
                                        </>
                                    )}

                                    {tftpFase === "transfiriendo" && (
                                        <div className="border-2 border-blue-600 bg-[#e6f0ff] p-3 flex flex-col gap-3">
                                            <div>
                                                <h3 className="text-blue-800 font-mono text-xs font-bold flex items-center gap-2">
                                                    <span className="animate-spin">🔄</span> TFTP ABIERTO Y TRANSMITIENDO
                                                </h3>
                                                <p className="text-black font-mono text-[11px] mt-2">
                                                    Macro inyectado. El archivo <b className="text-blue-800">{tftpStagingFile}</b> está siendo servido.<br/><br/>
                                                    <span className="bg-blue-200 p-1 border border-blue-400 font-bold block">
                                                        👉 Verifica el progreso en el terminal Minicom. 
                                                        Cuando termine, pulsa el botón inferior para borrar el rastro.
                                                    </span>
                                                </p>
                                            </div>
                                            <div className="mt-2">
                                                <button 
                                                    onClick={finalizarYLimpiarTFTP}
                                                    className="w-full bg-blue-600 hover:bg-blue-500 text-white border-2 border-t-[#80b3ff] border-l-[#80b3ff] border-b-black border-r-black px-4 py-3 font-mono text-xs font-bold shadow-[0_0_10px_rgba(37,99,235,0.4)]"
                                                >
                                                    ✅ DESCARGA COMPLETADA: LIMPIAR Y CERRAR
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {subiendoArchivo && (
                        <div className="absolute inset-0 flex items-center justify-center z-[70]">
                            <div className={`${win95Window} w-80 shadow-[4px_4px_0_#000]`}>
                                <div className={win95Title}><span>Cargando al servidor SRA...</span></div>
                                <div className="p-4 flex flex-col gap-4">
                                    <div className={win95Panel}><div className="bg-[#0000A0] h-4" style={{ width: `${progresoUpload}%` }}></div></div>
                                    <p className="text-center text-xs">{progresoUpload}% Completado</p>
                                    <button onClick={cancelarSubida} className={win95Button}>Abortar</button>
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
                                        <label className="text-xs font-bold mb-1">Propósito de la configuración:</label>
                                        <select 
                                            value={modoNetConf} 
                                            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setModoNetConf(e.target.value)} 
                                            className={win95Input}
                                        >
                                            <option value="web">IP para Web config</option>
                                            <option value="tftp">IP para Transferencia TFTP</option>
                                        </select>
                                    </div>

                                    <div className="flex flex-col gap-1 border border-[#808080] p-2 bg-white/50">
                                        <label className="text-xs font-bold mb-1">Configuración IP:</label>
                                        <div className="flex items-center gap-2">
                                            <input type="radio" id="dhcp" name="tipoRed" checked={tipoRed === "dhcp"} onChange={() => setTipoRed("dhcp")} />
                                            <label htmlFor="dhcp" className="text-xs cursor-pointer">DHCP Automático</label>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <input type="radio" id="manual" name="tipoRed" checked={tipoRed === "manual"} onChange={() => setTipoRed("manual")} />
                                            <label htmlFor="manual" className="text-xs cursor-pointer">IP Estática</label>
                                        </div>
                                    </div>
                                    {tipoRed === "manual" && (
                                        <div className="flex flex-col gap-2 border border-[#808080] p-2 bg-white/50">
                                            <div className="flex items-center justify-between"><span className="text-xs">IP:</span><input type="text" value={ipManual} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setIpManual(e.target.value)} className={`${win95Input} w-52`} /></div>
                                            <div className="flex items-center justify-between"><span className="text-xs">Subred:</span><input type="text" value={subnetManual} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSubnetManual(e.target.value)} className={`${win95Input} w-52`} /></div>
                                            <div className="flex items-center justify-between"><span className="text-xs">Gateway:</span><input type="text" value={gwManual} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setGwManual(e.target.value)} className={`${win95Input} w-52`} /></div>
                                            <div className="flex items-center justify-between"><span className="text-xs">DNS:</span><input type="text" value={dnsManual} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDnsManual(e.target.value)} className={`${win95Input} w-52`} placeholder="8.8.8.8" /></div>
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