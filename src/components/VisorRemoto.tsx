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

    const [backendHost, setBackendHost] = useState<string>("192.168.1.135:8080");
    const [email, setEmail] = useState<string>(""); // 🔥 NUEVO: Estado para el correo
    const [password, setPassword] = useState<string>("TuContrasenaSeguraAqui");

    const SESSION_UUID = "test-session-123";
    const lastMouseMove = useRef<number>(0);
    const frameCountRef = useRef<number>(0);
    const animationFrameIdRef = useRef<number | null>(null);

    const verificarEstadoAgente = useCallback(async () => {
        if (!backendHost) return;
        setVerificando(true);
        try {
            const res = await fetch(`http://${backendHost}/api/remote/session/${SESSION_UUID}/status`);
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
    }, [backendHost, SESSION_UUID]);

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
        if (!agenteOnline || !email) return;
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

    const manejarSubidaArchivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !token) return;

        setSubiendoArchivo(true);
        const formData = new FormData();
        formData.append("file", file);

        try {
            const res = await fetch(`http://${backendHost}/api/portal/stream-upload/${SESSION_UUID}`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.detail || "Error al transferir el binario");
            }
            alert("Archivo enviado con éxito al Agente.");
        } catch (err: any) {
            alert(`Fallo en la transferencia: ${err.message}`);
        } finally {
            setSubiendoArchivo(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
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
                setEstado("Autenticando...");
                const res = await fetch(`http://${backendHost}/api/remote/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: password })
                });

                if (!res.ok) throw new Error("Error de autenticación");
                const { access_token } = await res.json();
                setToken(access_token);

                setEstado("Solicitando conexión al Agente...");
                
                // 🔥 NUEVO: Enviamos el correo en el cuerpo de la petición HTTP
                const solicitudRes = await fetch(`http://${backendHost}/api/remote/session/${SESSION_UUID}/solicitar-conexion`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${access_token}` },
                    body: JSON.stringify({ email: email }) 
                });

                if (!solicitudRes.ok) throw new Error("No se pudo despertar al Agente.");

                setEstado("Conectando señalización...");
                const ws = new WebSocket(`ws://${backendHost}/api/remote/signaling/${SESSION_UUID}/visor?token=${access_token}`);
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
    }, [autenticado, backendHost, password, email, cerrarSesion]);

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
                    
                    {/* 🔥 NUEVO: Input de Correo */}
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full bg-zinc-950 border border-zinc-700 p-2 rounded text-sm font-mono focus:outline-none focus:border-green-500" placeholder="Tu correo corporativo" />
                    
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-zinc-950 border border-zinc-700 p-2 rounded text-sm font-mono focus:outline-none focus:border-green-500" placeholder="Contraseña de sesión" />
                    
                    <button type="submit" disabled={!agenteOnline || verificando || !email} className={`py-2 rounded font-bold font-mono text-sm tracking-wider transition-colors ${agenteOnline && email ? 'bg-green-600 hover:bg-green-500 text-white cursor-pointer' : 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700'}`}>
                        {agenteOnline ? 'CONECTAR' : 'NO DISPONIBLE'}
                    </button>
                </form>
            ) : (
                <div className="flex flex-col items-center gap-4 w-full max-w-7xl focus:outline-none" tabIndex={0} onKeyDown={manejarKeyDown} onKeyUp={manejarKeyUp}>
                    <div className="flex items-center justify-between w-full bg-zinc-900 px-5 py-2 rounded-full border border-zinc-800 shadow">
                        <div className="flex items-center gap-3">
                            <div className={`w-3 h-3 rounded-full ${estado === "TRANSMITIENDO EN VIVO" ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`} />
                            <span className="font-mono text-xs uppercase tracking-wide">
                                {estado} {fps > 0 && `• ${fps} FPS`}
                            </span>
                        </div>
                        
                        <div className="flex items-center gap-3">
                            <input 
                                type="file" 
                                ref={fileInputRef} 
                                style={{ display: 'none' }} 
                                accept=".bin,.out,.tgz,.img,.iso,.qcow2,.txt,.cfg" 
                                onChange={manejarSubidaArchivo}
                            />
                            <button 
                                onClick={() => fileInputRef.current?.click()}
                                disabled={subiendoArchivo}
                                className={`font-mono text-xs px-3 py-1 rounded-full transition-colors font-bold tracking-wide border ${subiendoArchivo ? 'bg-zinc-800 border-zinc-700 text-zinc-500' : 'bg-blue-950 hover:bg-blue-900 border-blue-800 text-blue-200'}`}
                            >
                                {subiendoArchivo ? '⏳ SUBIENDO...' : '📎 SUBIR ARCHIVO'}
                            </button>

                            <button onClick={cerrarSesion} className="bg-red-950 hover:bg-red-900 border border-red-800 text-red-200 font-mono text-xs px-3 py-1 rounded-full transition-colors font-bold tracking-wide">
                                CERRAR SESIÓN
                            </button>
                        </div>
                    </div>
                    
                    <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden shadow-2xl border border-zinc-800 flex items-center justify-center">
                        <video ref={videoRef} autoPlay playsInline muted onMouseMove={manejarMouseMove} onMouseDown={manejarMouseDown} onMouseUp={manejarMouseUp} onWheel={manejarScroll} className="w-full h-full object-contain cursor-crosshair" />
                    </div>
                </div>
            )}
        </div>
    );
}