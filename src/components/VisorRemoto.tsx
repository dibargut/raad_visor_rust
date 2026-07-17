import React, { useEffect, useRef, useState, useCallback } from 'react';

interface CoordenadasRelativas {
    x: number;
    y: number;
    w: number;
    h: number;
}

export default function VisorRemoto() {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const peerRef = useRef<RTCPeerConnection | null>(null);
    const dataChannelRef = useRef<RTCDataChannel | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const [autenticado, setAutenticado] = useState<boolean>(false);
    const [token, setToken] = useState<string | null>(null);
    const [estado, setEstado] = useState<string>("Esperando credenciales...");
    const [fps, setFps] = useState<number>(0);
    const [agenteOnline, setAgenteOnline] = useState<boolean | null>(null);
    const [verificando, setVerificando] = useState<boolean>(false);
    
    const [subiendoArchivo, setSubiendoArchivo] = useState<boolean>(false);
    const [progresoUpload, setProgresoUpload] = useState<number>(0);

    const [mostrarModalPortapapeles, setMostrarModalPortapapeles] = useState<boolean>(false);
    const [textoPortapapeles, setTextoPortapapeles] = useState<string>("");

    const [backendHost, setBackendHost] = useState<string>("192.168.1.135:8080");
    const [sessionUuid, setSessionUuid] = useState<string>("SRA-AGENT-PC01"); 
    const [email, setEmail] = useState<string>(""); 

    // 🔥 PON TU CONTRASEÑA REAL AQUÍ. Se enviará de forma invisible al backend.
    const PASSWORD_SECRETA = "TuContrasenaSeguraAqui";

    const lastMouseMove = useRef<number>(0);
    const frameCountRef = useRef<number>(0);
    const animationFrameIdRef = useRef<number | null>(null);

    const verificarEstadoAgente = useCallback(async () => {
        if (!backendHost || !sessionUuid) {
            setAgenteOnline(false);
            return;
        }
        setVerificando(true);
        try {
            const res = await fetch(`http://${backendHost}/api/remote/session/${sessionUuid}/status`);
            if (res.ok) {
                const data = await res.json();
                setAgenteOnline(data.agente_online === true);
            } else {
                setAgenteOnline(false);
            }
        } catch (error) {
            setAgenteOnline(false);
        } finally {
            setVerificando(false);
        }
    }, [backendHost, sessionUuid]); 

    useEffect(() => {
        verificarEstadoAgente();
        const intervalId = setInterval(() => {
            if (!autenticado) verificarEstadoAgente();
        }, 5000);
        return () => clearInterval(intervalId);
    }, [verificarEstadoAgente, autenticado]);

    const enviarComando = useCallback((comando: any) => {
        const payload = JSON.stringify(comando);
        if (dataChannelRef.current?.readyState === 'open') {
            dataChannelRef.current.send(payload);
        } else if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(payload);
        }
    }, []);

    const obtenerCoordenadasRelativas = (e: React.MouseEvent<HTMLVideoElement>): CoordenadasRelativas => {
        if (!videoRef.current) return { x: 0, y: 0, w: 1, h: 1 };
        const rect = videoRef.current.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top, w: rect.width, h: rect.height };
    };

    const manejarMouseMove = (e: React.MouseEvent<HTMLVideoElement>) => {
        const ahora = Date.now();
        if (ahora - lastMouseMove.current < 33) return; 
        lastMouseMove.current = ahora;
        const coords = obtenerCoordenadasRelativas(e);
        enviarComando({ event: "mouse_move", x_píxel: coords.x, y_píxel: coords.y, w_nativa: coords.w, h_nativa: coords.h });
    };

    const manejarMouseDown = (e: React.MouseEvent<HTMLVideoElement>) => {
        const coords = obtenerCoordenadasRelativas(e);
        enviarComando({ event: "mouse_down", button: e.button === 2 ? "right" : "left", x_píxel: coords.x, y_píxel: coords.y, w_nativa: coords.w, h_nativa: coords.h });
    };

    const manejarMouseUp = (e: React.MouseEvent<HTMLVideoElement>) => {
        const coords = obtenerCoordenadasRelativas(e);
        enviarComando({ event: "mouse_up", button: e.button === 2 ? "right" : "left", x_píxel: coords.x, y_píxel: coords.y, w_nativa: coords.w, h_nativa: coords.h });
    };

    const manejarScroll = (e: React.WheelEvent<HTMLVideoElement>) => {
        enviarComando({ event: "scroll", delta_x: Math.round(e.deltaX), delta_y: Math.round(-e.deltaY) });
    };

    const manejarKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (["Space", " ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) e.preventDefault();
        enviarComando({ event: "key_down", key: e.key });
    };

    const manejarKeyUp = (e: React.KeyboardEvent<HTMLDivElement>) => {
        enviarComando({ event: "key_up", key: e.key });
    };

    const conectarAgente = (e: React.FormEvent) => {
        e.preventDefault();
        if (!agenteOnline || !email || !sessionUuid) return;
        setAutenticado(true);
    };

    const cerrarSesion = useCallback(() => {
        if (videoRef.current && videoRef.current.srcObject) {
            const stream = videoRef.current.srcObject as MediaStream;
            stream.getTracks().forEach(track => track.stop());
            videoRef.current.srcObject = null;
        }
        if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
        if (dataChannelRef.current) { dataChannelRef.current.close(); dataChannelRef.current = null; }
        if (peerRef.current) { peerRef.current.close(); peerRef.current = null; }
        if (animationFrameIdRef.current) { cancelAnimationFrame(animationFrameIdRef.current); animationFrameIdRef.current = null; }
        
        setFps(0);
        setEstado("Esperando credenciales...");
        setAutenticado(false);
        setToken(null);
        verificarEstadoAgente();
    }, [verificarEstadoAgente]);

    // =======================================================================
    // 🚀 MOTOR P2P: TRANSFERENCIA DE ARCHIVOS SEGURA (WAN-SAFE)
    // =======================================================================
    const manejarSubidaArchivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!dataChannelRef.current || dataChannelRef.current.readyState !== 'open') {
            alert("Error: El canal P2P no está abierto.");
            if (fileInputRef.current) fileInputRef.current.value = "";
            return;
        }

        setSubiendoArchivo(true);
        setProgresoUpload(0);

        try {
            enviarComando({ action: "start", filename: file.name, filesize: file.size });

            const chunkSize = 16384; // 16 KB exactos para evitar fragmentación en Internet
            const bufferThreshold = 2 * 1024 * 1024; // 2 MB máximo en la memoria del navegador
            let offset = 0;
            let lastUiUpdate = 0;

            while (offset < file.size) {
                // Contrapresión: Si el tubo de Internet está lleno, dormimos 5ms
                if (dataChannelRef.current.bufferedAmount >= bufferThreshold) {
                    await new Promise(resolve => setTimeout(resolve, 5));
                    continue; 
                }

                const slice = file.slice(offset, offset + chunkSize);
                const chunk = await slice.arrayBuffer();
                dataChannelRef.current.send(chunk);
                offset += chunkSize;
                
                // Actualización limpia de UI
                const currentPercent = Math.min(100, Math.floor((offset / file.size) * 100));
                if (currentPercent > lastUiUpdate) {
                    setProgresoUpload(currentPercent);
                    lastUiUpdate = currentPercent;
                }
            }

            enviarComando({ action: "end" });
            
        } catch (err: any) {
            alert(`Fallo en la transferencia P2P: ${err.message}`);
        } finally {
            setTimeout(() => {
                setSubiendoArchivo(false);
                setProgresoUpload(0);
                if (fileInputRef.current) fileInputRef.current.value = "";
            }, 1000);
        }
    };

    const sincronizarPortapapeles = () => {
        enviarComando({ event: "clipboard_sync", text: textoPortapapeles });
        setMostrarModalPortapapeles(false);
        setTextoPortapapeles("");
        alert("Portapapeles sincronizado.");
    };

    useEffect(() => {
        if (!autenticado) return;

        let fpsInterval: ReturnType<typeof setInterval>;
        const contarFrames = () => {
            if (videoRef.current && !videoRef.current.paused) frameCountRef.current++;
            animationFrameIdRef.current = requestAnimationFrame(contarFrames);
        };

        async function iniciarConexion() {
            try {
                setEstado("Autenticando de forma invisible...");
                
                // 🔥 Inyección silenciosa de la contraseña real
                const res = await fetch(`http://${backendHost}/api/remote/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: PASSWORD_SECRETA }) 
                });

                if (!res.ok) throw new Error("Error de autenticación silenciosa (Revisa PASSWORD_SECRETA)");
                const { access_token } = await res.json();
                setToken(access_token);

                setEstado("Solicitando conexión al Agente...");
                
                const solicitudRes = await fetch(`http://${backendHost}/api/remote/session/${sessionUuid}/solicitar-conexion`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${access_token}` },
                    body: JSON.stringify({ email: email }) 
                });

                if (!solicitudRes.ok) throw new Error("No se pudo despertar al Agente.");

                setEstado("Conectando señalización...");
                const ws = new WebSocket(`ws://${backendHost}/api/remote/signaling/${sessionUuid}/visor?token=${access_token}`);
                wsRef.current = ws;

                ws.onclose = () => { cerrarSesion(); };

                const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
                peerRef.current = pc;

                pc.onconnectionstatechange = () => {
                    if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) cerrarSesion();
                };

                pc.onicecandidate = (event) => {
                    if (event.candidate && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ ice: event.candidate }));
                };

                pc.addTransceiver('video', { direction: 'recvonly' });
                pc.ondatachannel = (event) => { dataChannelRef.current = event.channel; };

                pc.ontrack = (event) => {
                    if (videoRef.current && event.streams[0]) {
                        videoRef.current.srcObject = event.streams[0];
                        setEstado("TRANSMITIENDO EN VIVO");
                        if (!animationFrameIdRef.current) contarFrames();
                    }
                };

                ws.onmessage = async (event) => {
                    const msg = JSON.parse(event.data);
                    if (msg.sdp) {
                        await pc.setRemoteDescription(new RTCSessionDescription({ type: msg.sdp.type, sdp: msg.sdp.sdp }));
                        if (msg.sdp.type === 'offer') {
                            const answer = await pc.createAnswer();
                            await pc.setLocalDescription(answer);
                            if (ws.readyState === WebSocket.OPEN && pc.localDescription) {
                                ws.send(JSON.stringify({ sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } }));
                                setEstado("Sincronizando vídeo...");
                            }
                        }
                    } else if (msg.ice) {
                        try { await pc.addIceCandidate(new RTCIceCandidate(msg.ice)); } catch (e) {}
                    }
                };
            } catch (err: any) {
                setEstado(`❌ Error: ${err.message}`);
                setAutenticado(false);
            }
        }

        iniciarConexion();

        fpsInterval = setInterval(() => {
            setFps(frameCountRef.current);
            frameCountRef.current = 0;
        }, 1000);

        return () => {
            clearInterval(fpsInterval);
            cerrarSesion();
        };
    }, [autenticado, backendHost, email, cerrarSesion, sessionUuid]);

    return (
        <div className="bg-zinc-950 w-screen h-screen flex flex-col items-center justify-center text-white p-4">
            {!autenticado ? (
                <form onSubmit={conectarAgente} className="bg-zinc-900 p-8 rounded-xl border border-zinc-800 shadow-xl w-96 flex flex-col gap-4">
                    <h2 className="text-xl font-bold font-mono text-center">Guardian Visor</h2>
                    
                    <div className="flex items-center justify-center gap-2 mb-2 bg-zinc-950 p-2 rounded border border-zinc-800">
                        {verificando ? (
                            <><div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" /><span className="text-xs font-mono text-zinc-400">Verificando conexión...</span></>
                        ) : agenteOnline ? (
                            <><div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]" /><span className="text-xs font-mono text-green-400 font-bold">Agente En Línea</span></>
                        ) : (
                            <><div className="w-2 h-2 rounded-full bg-red-500" /><span className="text-xs font-mono text-red-400">Agente Desconectado</span></>
                        )}
                    </div>

                    <input type="text" value={backendHost} onChange={(e) => { setBackendHost(e.target.value); setAgenteOnline(null); }} className="w-full bg-zinc-950 border border-zinc-700 p-2 rounded text-sm font-mono focus:outline-none focus:border-green-500" placeholder="Host (ej. 192.168.1.135:8080)" />
                    
                    <input type="text" value={sessionUuid} onChange={(e) => { setSessionUuid(e.target.value); setAgenteOnline(null); }} required className="w-full bg-zinc-950 border border-zinc-700 p-2 rounded text-sm font-mono focus:outline-none focus:border-green-500 text-blue-400" placeholder="ID del Agente (ej. SRA-AGENT-PC01)" />
                    
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full bg-zinc-950 border border-zinc-700 p-2 rounded text-sm font-mono focus:outline-none focus:border-green-500" placeholder="Tu correo corporativo" />
                    
                    <button type="submit" disabled={!agenteOnline || verificando || !email || !sessionUuid} className={`py-2 rounded font-bold font-mono text-sm tracking-wider transition-colors ${agenteOnline && email ? 'bg-green-600 hover:bg-green-500 text-white cursor-pointer' : 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700'}`}>
                        {agenteOnline ? 'CONECTAR' : 'NO DISPONIBLE'}
                    </button>
                </form>
            ) : (
                <div className="flex flex-col items-center gap-4 w-full max-w-7xl focus:outline-none" tabIndex={0} onKeyDown={manejarKeyDown} onKeyUp={manejarKeyUp}>
                    <div className="flex items-center justify-between w-full bg-zinc-900 px-5 py-2 rounded-full border border-zinc-800 shadow">
                        <div className="flex items-center gap-3">
                            <div className={`w-3 h-3 rounded-full ${estado === "TRANSMITIENDO EN VIVO" ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`} />
                            <span className="font-mono text-xs uppercase tracking-wide">{estado} {fps > 0 && `• ${fps} FPS`}</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <button onClick={() => setMostrarModalPortapapeles(true)} className="bg-emerald-950 hover:bg-emerald-900 border border-emerald-800 text-emerald-200 font-mono text-xs px-3 py-1 rounded-full transition-colors font-bold tracking-wide">📋 PORTAPAPELES</button>
                            
                            <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={manejarSubidaArchivo}/>
                            
                            {subiendoArchivo ? (
                                <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-full px-3 py-1 w-48 shadow-inner">
                                    <span className="text-xs font-mono text-blue-400 font-bold w-8 text-right">{progresoUpload}%</span>
                                    <div className="w-full bg-zinc-900 rounded-full h-1.5 overflow-hidden">
                                        <div className="bg-blue-500 h-full transition-all duration-100 ease-linear shadow-[0_0_8px_rgba(59,130,246,0.8)]" style={{ width: `${progresoUpload}%` }} />
                                    </div>
                                </div>
                            ) : (
                                <button onClick={() => fileInputRef.current?.click()} className="bg-blue-950 hover:bg-blue-900 border border-blue-800 text-blue-200 font-mono text-xs px-3 py-1 rounded-full transition-colors font-bold tracking-wide">📎 SUBIR ARCHIVO</button>
                            )}

                            <button onClick={cerrarSesion} className="bg-red-950 hover:bg-red-900 border border-red-800 text-red-200 font-mono text-xs px-3 py-1 rounded-full transition-colors font-bold tracking-wide">CERRAR SESIÓN</button>
                        </div>
                    </div>
                    
                    <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden shadow-2xl border border-zinc-800 flex items-center justify-center">
                        <video ref={videoRef} autoPlay playsInline muted onMouseMove={manejarMouseMove} onMouseDown={manejarMouseDown} onMouseUp={manejarMouseUp} onWheel={manejarScroll} onContextMenu={(e) => e.preventDefault()} className="w-full h-full object-contain cursor-crosshair" />
                    </div>
                </div>
            )}

            {mostrarModalPortapapeles && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 w-full max-w-lg shadow-2xl flex flex-col gap-4">
                        <h3 className="text-lg font-bold font-mono text-emerald-400">📋 Sincronizar Portapapeles</h3>
                        <p className="text-xs text-zinc-400">Pega aquí el texto → el equipo remoto. Una vez sincronizado, podrás hacer Click Derecho → Pegar.</p>
                        <textarea value={textoPortapapeles} onChange={(e) => setTextoPortapapeles(e.target.value)} className="w-full h-32 bg-zinc-950 border border-zinc-700 rounded p-3 text-sm font-mono focus:outline-none focus:border-emerald-500 resize-none text-zinc-200" placeholder="Pega tu texto aquí..." autoFocus />
                        <div className="flex gap-2 justify-end mt-2">
                            <button onClick={() => setMostrarModalPortapapeles(false)} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold font-mono text-xs rounded transition-colors">CANCELAR</button>
                            <button onClick={sincronizarPortapapeles} disabled={!textoPortapapeles} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-bold font-mono text-xs rounded transition-colors">SINCRONIZAR AHORA</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}