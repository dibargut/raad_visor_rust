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

    const [autenticado, setAutenticado] = useState<boolean>(false);
    const [estado, setEstado] = useState<string>("Esperando credenciales...");
    const [fps, setFps] = useState<number>(0);

    const [backendHost, setBackendHost] = useState<string>("192.168.1.135:8080");
    const [password, setPassword] = useState<string>("TuContrasenaSeguraAqui");

    const SESSION_UUID = "test-session-123";
    const lastMouseMove = useRef<number>(0);
    const frameCountRef = useRef<number>(0);
    const animationFrameIdRef = useRef<number | null>(null);

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
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
            w: rect.width,
            h: rect.height
        };
    };

    const manejarMouseMove = (e: React.MouseEvent<HTMLVideoElement>) => {
        const ahora = Date.now();
        if (ahora - lastMouseMove.current < 33) return; // Throttling a ~30Hz
        lastMouseMove.current = ahora;

        const coords = obtenerCoordenadasRelativas(e);
        enviarComando({
            event: "mouse_move",
            x_píxel: coords.x,
            y_píxel: coords.y,
            w_nativa: coords.w,
            h_nativa: coords.h
        });
    };

    const manejarMouseDown = (e: React.MouseEvent<HTMLVideoElement>) => {
        const coords = obtenerCoordenadasRelativas(e);
        enviarComando({
            event: "mouse_down",
            button: e.button === 2 ? "right" : "left",
            x_píxel: coords.x,
            y_píxel: coords.y,
            w_nativa: coords.w,
            h_nativa: coords.h
        });
    };

    const manejarMouseUp = (e: React.MouseEvent<HTMLVideoElement>) => {
        const coords = obtenerCoordenadasRelativas(e);
        enviarComando({
            event: "mouse_up",
            button: e.button === 2 ? "right" : "left",
            x_píxel: coords.x,
            y_píxel: coords.y,
            w_nativa: coords.w,
            h_nativa: coords.h
        });
    };

    // 🔥 NUEVO: Manejar Scroll / Rueda del ratón
    const manejarScroll = (e: React.WheelEvent<HTMLVideoElement>) => {
        enviarComando({
            event: "scroll",
            delta_x: Math.round(e.deltaX),
            delta_y: Math.round(-e.deltaY) // macOS suele requerir invertir el eje Y para scroll natural
        });
    };

    // 🔥 NUEVO: Manejar pulsaciones del teclado
    const manejarKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        // Evitamos que espacio o flechas hagan scroll en el propio navegador del visor
        if (["Space", " ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
            e.preventDefault();
        }
        enviarComando({
            event: "key_down",
            key: e.key
        });
    };

    const manejarKeyUp = (e: React.KeyboardEvent<HTMLDivElement>) => {
        enviarComando({
            event: "key_up",
            key: e.key
        });
    };

    const conectarAgente = (e: React.FormEvent) => {
        e.preventDefault();
        setAutenticado(true);
    };

    const cerrarSesion = () => {
        if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
        if (peerRef.current) { peerRef.current.close(); peerRef.current = null; }
        if (dataChannelRef.current) { dataChannelRef.current.close(); dataChannelRef.current = null; }
        if (animationFrameIdRef.current) { cancelAnimationFrame(animationFrameIdRef.current); animationFrameIdRef.current = null; }
        setFps(0);
        setEstado("Esperando credenciales...");
        setAutenticado(false);
    };

    useEffect(() => {
        if (!autenticado) return;

        let fpsInterval: ReturnType<typeof setInterval>;

        const contarFrames = () => {
            if (videoRef.current && !videoRef.current.paused) {
                frameCountRef.current++;
            }
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

                setEstado("Conectando señalización...");

                const ws = new WebSocket(`ws://${backendHost}/api/remote/signaling/${SESSION_UUID}/visor?token=${access_token}`);
                wsRef.current = ws;

                const pc = new RTCPeerConnection({
                    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
                });
                peerRef.current = pc;

                pc.onicecandidate = (event) => {
                    if (event.candidate && ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ ice: event.candidate }));
                    }
                };

                pc.addTransceiver('video', { direction: 'recvonly' });

                pc.ondatachannel = (event) => {
                    console.log("¡DataChannel de control WebRTC abierto!");
                    dataChannelRef.current = event.channel;
                };

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
                        await pc.setRemoteDescription(new RTCSessionDescription({
                            type: msg.sdp.type,
                            sdp: msg.sdp.sdp
                        }));
                        
                        if (msg.sdp.type === 'offer') {
                            const answer = await pc.createAnswer();
                            await pc.setLocalDescription(answer);
                            
                            if (ws.readyState === WebSocket.OPEN && pc.localDescription) {
                                ws.send(JSON.stringify({
                                    sdp: {
                                        type: pc.localDescription.type,
                                        sdp: pc.localDescription.sdp
                                    }
                                }));
                                setEstado("Sincronizando vídeo...");
                            }
                        }
                    } 
                    else if (msg.ice) {
                        try {
                            await pc.addIceCandidate(new RTCIceCandidate(msg.ice));
                        } catch (e) {
                            console.warn("Error agregando ICE remoto:", e);
                        }
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
            if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
            if (wsRef.current) wsRef.current.close();
            if (peerRef.current) peerRef.current.close();
        };
    }, [autenticado, backendHost, password]);

    return (
        <div className="bg-zinc-950 w-screen h-screen flex flex-col items-center justify-center text-white p-4">
            {!autenticado ? (
                <form onSubmit={conectarAgente} className="bg-zinc-900 p-8 rounded-xl border border-zinc-800 shadow-xl w-96 flex flex-col gap-4">
                    <h2 className="text-xl font-bold font-mono text-center">Guardian Visor</h2>
                    <input 
                        type="text" 
                        value={backendHost} 
                        onChange={(e) => setBackendHost(e.target.value)} 
                        className="w-full bg-zinc-950 border border-zinc-700 p-2 rounded text-sm font-mono focus:outline-none focus:border-green-500"
                    />
                    <input 
                        type="password" 
                        value={password} 
                        onChange={(e) => setPassword(e.target.value)} 
                        className="w-full bg-zinc-950 border border-zinc-700 p-2 rounded text-sm font-mono focus:outline-none focus:border-green-500"
                    />
                    <button type="submit" className="bg-green-600 hover:bg-green-500 transition-colors py-2 rounded font-bold font-mono text-sm tracking-wider">
                        CONECTAR
                    </button>
                </form>
            ) : (
                /* 🔥 tabIndex={0} y listeners añadidos aquí para poder capturar inputs de teclado al hacer clic en el contenedor */
                <div 
                    className="flex flex-col items-center gap-4 w-full max-w-7xl focus:outline-none"
                    tabIndex={0}
                    onKeyDown={manejarKeyDown}
                    onKeyUp={manejarKeyUp}
                >
                    <div className="flex items-center justify-between w-full bg-zinc-900 px-5 py-2 rounded-full border border-zinc-800 shadow">
                        <div className="flex items-center gap-3">
                            <div className={`w-3 h-3 rounded-full ${estado === "TRANSMITIENDO EN VIVO" ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`} />
                            <span className="font-mono text-xs uppercase tracking-wide">
                                {estado} {fps > 0 && `• ${fps} FPS`}
                            </span>
                        </div>
                        <button 
                            onClick={cerrarSesion}
                            className="bg-red-950 hover:bg-red-900 border border-red-800 text-red-200 font-mono text-xs px-3 py-1 rounded-full transition-colors font-bold tracking-wide"
                        >
                            CERRAR SESIÓN
                        </button>
                    </div>
                    
                    <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden shadow-2xl border border-zinc-800 flex items-center justify-center">
                        <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted
                            onMouseMove={manejarMouseMove}
                            onMouseDown={manejarMouseDown}
                            onMouseUp={manejarMouseUp}
                            onWheel={manejarScroll} 
                            className="w-full h-full object-contain cursor-crosshair"
                        />
                    </div>
                </div>
            )}
        </div>
    );
}