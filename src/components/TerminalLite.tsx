import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

interface TerminalLiteProps {
    uuid: string;
    backendHost: string;
    token: string;
}

export default function TerminalLite({ uuid, backendHost, token }: TerminalLiteProps) {
    const terminalRef = useRef<HTMLDivElement | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const termRef = useRef<Terminal | null>(null);
    
    const [conectado, setConectado] = useState<boolean>(false);
    const [consolaActiva, setConsolaActiva] = useState<boolean>(false); 

    const [mostrarModalManual, setMostrarModalManual] = useState<boolean>(false);
    const [manualPort, setManualPort] = useState<string>("/dev/ttyUSB0");
    const [manualBaud, setManualBaud] = useState<string>("9600");

    useEffect(() => {
        if (!terminalRef.current) return;

        const term = new Terminal({
            cursorBlink: true,
            theme: { background: '#09090b', foreground: '#a1a1aa' },
            fontFamily: 'monospace',
            fontSize: 14
        });
        
        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.open(terminalRef.current);
        fitAddon.fit();
        termRef.current = term;

        term.writeln(`Conectando al túnel de gestión seguro para el nodo ${uuid}...`);

        const wsUrl = `wss://${backendHost}/api/remote/lite/web/${uuid}?token=${token || ""}`;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            setConectado(true);
            term.clear();
            term.writeln(`[SRA] Enlace OOB establecido con éxito.`);
            term.writeln(`[SRA] Conecta el puerto serie usando el panel superior.\r\n`);
        };

        ws.onmessage = (event: MessageEvent) => {
            const dataStr = typeof event.data === 'string' ? event.data : '';

            if (dataStr.includes('--- INICIANDO ENLACE SERIE')) setConsolaActiva(true);
            if (dataStr.includes('--- ENLACE SERIE TERMINADO ---')) setConsolaActiva(false);

            try {
                const payload = JSON.parse(dataStr);
                if (payload.output) { term.write(payload.output); return; }
                if (payload.data && typeof payload.data === 'string') { term.write(payload.data); return; }
            } catch (e) {
                term.write(dataStr);
            }
        };

        ws.onclose = () => {
            setConectado(false);
            setConsolaActiva(false);
            term.writeln('\r\n[!] Desconectado del servidor central.');
        };

        term.onData((data: string) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(data);
            }
        });

        const handleResize = () => fitAddon.fit();
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            ws.close();
            term.dispose();
        };
    }, [uuid, backendHost, token]);

    const enviarComando = async (action: string, params: Record<string, any> = {}) => {
        try {
            await fetch(`https://${backendHost}/api/remote/lite/command/${uuid}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, params })
            });

            termRef.current?.focus();
        } catch (error) {
            console.error("Fallo al enviar comando:", error);
        }
    };

    return (
        <div className="flex flex-col h-full bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl relative">
            <div className="flex items-center justify-between bg-zinc-900 p-3 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${conectado ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]' : 'bg-red-500'}`} />
                    <span className="font-mono text-xs text-zinc-300 font-bold uppercase tracking-wide">
                        LITE C2 • MINICOM
                    </span>
                    {consolaActiva && (
                        <span className="ml-2 px-2 py-0.5 bg-blue-900 text-blue-200 text-[10px] font-bold rounded animate-pulse uppercase">
                            SERIE ACTIVA
                        </span>
                    )}
                </div>

                <div className="flex gap-2">
                    <button 
                        onClick={() => setMostrarModalManual(true)}
                        disabled={!conectado || consolaActiva}
                        className="px-4 py-1.5 bg-blue-950 hover:bg-blue-900 disabled:opacity-50 text-blue-200 border border-blue-800 font-mono text-xs rounded transition-colors focus:outline-none cursor-pointer font-bold"
                    >
                        ⚙️ CONFIGURAR PUERTO SERIE
                    </button>
                </div>
            </div>

            <div className="flex-1 w-full h-96 p-2 bg-[#09090b]">
                <div ref={terminalRef} className="w-full h-full" />
            </div>

            {mostrarModalManual && (
                <div className="absolute inset-0 bg-black/80 flex items-center justify-center p-4 z-[60]">
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 w-full max-w-sm space-y-4 text-xs font-mono shadow-2xl">
                        <h3 className="text-sm font-bold text-cyan-400 tracking-wider mb-4 border-b border-slate-800 pb-2">🛠️ CONEXIÓN SERIE</h3>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="block text-slate-400 mb-1">Puerto de Dispositivo (Device)</label>
                                <input 
                                    type="text" 
                                    value={manualPort} 
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setManualPort(e.target.value)} 
                                    className="w-full bg-slate-950 p-2.5 border border-slate-800 rounded-lg text-cyan-300 focus:outline-none focus:border-cyan-500 transition-colors" 
                                    placeholder="/dev/ttyUSB0" 
                                />
                            </div>
                            <div>
                                <label className="block text-slate-400 mb-1">Velocidad de Reloj (Baud Rate)</label>
                                <select 
                                    value={manualBaud} 
                                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setManualBaud(e.target.value)} 
                                    className="w-full bg-slate-950 p-2.5 border border-slate-800 rounded-lg text-cyan-300 focus:outline-none focus:border-cyan-500 transition-colors cursor-pointer"
                                >
                                    <option value="9600">9600 baudios</option>
                                    <option value="19200">19200 baudios</option>
                                    <option value="38400">38400 baudios</option>
                                    <option value="57600">57600 baudios</option>
                                    <option value="115200">115200 baudios</option>
                                </select>
                            </div>
                        </div>

                        <div className="flex gap-2 mt-6 pt-2">
                            <button 
                                onClick={() => setMostrarModalManual(false)} 
                                className="w-1/2 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-bold transition-colors"
                            >
                                CANCELAR
                            </button>
                            <button 
                                onClick={() => {
                                    enviarComando("run_minicom", { profile: "manual", baud: manualBaud, port: manualPort });
                                    setMostrarModalManual(false);
                                }} 
                                className="w-1/2 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold rounded transition-colors"
                            >
                                INICIAR ENLACE
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}