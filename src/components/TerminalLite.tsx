import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

interface TerminalLiteProps {
    uuid: string;
    backendHost: string;
}

export default function TerminalLite({ uuid, backendHost }: TerminalLiteProps) {
    const terminalRef = useRef<HTMLDivElement>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const termRef = useRef<Terminal | null>(null);
    
    const [conectado, setConectado] = useState<boolean>(false);
    const [subiendo, setSubiendo] = useState<boolean>(false); 

    // Estados del Explorador
    const [archivosTftp, setArchivosTftp] = useState<string[]>([]);
    const [mostrarGestor, setMostrarGestor] = useState<boolean>(false);
    const [consolaActiva, setConsolaActiva] = useState<boolean>(false); 
    
    // Memoria del equipo conectado para el Macro automático
    const [perfilActivo, setPerfilActivo] = useState<string>("cisco"); 

    // Estados del Modal de Conexión Manual
    const [mostrarModalManual, setMostrarModalManual] = useState<boolean>(false);
    const [manualPort, setManualPort] = useState<string>("/dev/ttyUSB0");
    const [manualBaud, setManualBaud] = useState<string>("9600");
    const [manualOs, setManualOs] = useState<string>("cisco");
    
    const raspiIp = "192.168.1.135"; // Cambiar por variable de entorno o DB

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

        const wsUrl = `ws://${backendHost}/api/remote/lite/web/${uuid}`;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            setConectado(true);
            term.clear();
            term.writeln(`[SRA] Enlace OOB establecido con éxito.`);
            term.writeln(`[SRA] Selecciona una herramienta de red en el panel superior.\r\n`);
        };

        ws.onmessage = (event: MessageEvent) => {
            if (typeof event.data === 'string') {
                if (event.data.includes('--- INICIANDO ENLACE SERIE')) setConsolaActiva(true);
                if (event.data.includes('--- ENLACE SERIE TERMINADO ---')) setConsolaActiva(false);

                try {
                    const payload = JSON.parse(event.data);
                    if (payload.event === "tftp_file_list") {
                        setArchivosTftp(payload.files);
                        return; 
                    }
                } catch (e) {
                    term.write(event.data);
                }
            } else {
                term.write(event.data);
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
    }, [uuid, backendHost]);

    const enviarComando = async (action: string, params: Record<string, any> = {}) => {
        try {
            await fetch(`http://${backendHost}/api/remote/lite/command/${uuid}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, params })
            });
            if (termRef.current) termRef.current.focus();
        } catch (error) {
            console.error("Fallo al enviar comando:", error);
        }
    };

    return (
        <div className="flex flex-col h-full bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl relative">
            {/* Barra de Herramientas Zero-Trust */}
            <div className="flex items-center justify-between bg-zinc-900 p-3 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${conectado ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]' : 'bg-red-500'}`} />
                    <span className="font-mono text-xs text-zinc-300 font-bold uppercase tracking-wide">
                        LITE C2 • {uuid}
                    </span>
                    {consolaActiva && (
                        <span className="ml-2 px-2 py-0.5 bg-blue-900 text-blue-200 text-[10px] font-bold rounded animate-pulse uppercase">
                            SERIE ACTIVA ({perfilActivo})
                        </span>
                    )}
                </div>

                <div className="flex gap-2">
                    <select 
                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                            const val = e.target.value;
                            if (val === "manual") {
                                setMostrarModalManual(true);
                            } else if (val) {
                                setPerfilActivo(val); 
                                enviarComando("run_minicom", { profile: val });
                            }
                            e.target.value = ""; 
                        }}
                        disabled={!conectado || consolaActiva}
                        className="px-3 py-1 bg-blue-950 hover:bg-blue-900 disabled:opacity-50 text-blue-200 border border-blue-800 font-mono text-xs rounded transition-colors focus:outline-none cursor-pointer font-bold"
                    >
                        <option value="">⚙️ MINICOM...</option>
                        <option value="paloalto">PaloAlto (9600)</option>
                        <option value="huawei">Huawei (115200)</option>
                        <option value="fortinet">Fortinet (9600)</option>
                        <option value="cisco">Cisco (9600)</option>
                        <option value="manual">⚙️ MANUAL...</option>
                    </select>

                    <label className={`px-3 py-1 bg-purple-950 hover:bg-purple-900 disabled:opacity-50 text-purple-200 border border-purple-800 font-mono text-xs rounded transition-colors ${conectado && !subiendo ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'} font-bold flex items-center gap-2`}>
                        {subiendo ? '⏳ INYECTANDO...' : '⬆️ STREAM ARCHIVO'}
                        <input 
                            type="file" 
                            className="hidden" 
                            disabled={!conectado || subiendo}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                const file = e.target.files?.[0];
                                if (!file) return;

                                const allowedExtensions = ['.bin', '.cfg', '.conf', '.txt', '.xml', '.tgz', '.tar.gz', '.pkg', '.image', '.out'];
                                const fileName = file.name.toLowerCase();
                                const isValid = allowedExtensions.some(ext => fileName.endsWith(ext));

                                if (!isValid) {
                                    termRef.current?.writeln(`\r\n[🔒 SRA SECURITY] Transferencia abortada: Tipo de archivo no admitido.`);
                                    termRef.current?.writeln(`[INFO] Permitidos: ${allowedExtensions.join(', ')}\r\n`);
                                    e.target.value = ""; 
                                    return; 
                                }

                                setSubiendo(true);
                                enviarComando("start_file_transfer", { filename: file.name, size: file.size });

                                setTimeout(() => {
                                    const reader = new FileReader();
                                    const chunkSize = 64 * 1024;
                                    let offset = 0;

                                    termRef.current?.writeln(`\r\n[STREAM] Iniciando inyección binaria de ${file.name}...`);

                                    reader.onload = (event: ProgressEvent<FileReader>) => {
                                        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && event.target?.result) {
                                            wsRef.current.send(event.target.result as ArrayBuffer);
                                        }
                                        
                                        offset += chunkSize;
                                        
                                        if (offset < file.size) {
                                            readNextChunk();
                                        } else {
                                            enviarComando("end_file_transfer", {});
                                            setSubiendo(false);
                                        }
                                    };

                                    const readNextChunk = () => {
                                        const slice = file.slice(offset, offset + chunkSize);
                                        reader.readAsArrayBuffer(slice);
                                    };

                                    readNextChunk(); 

                                }, 500);

                                e.target.value = ""; 
                            }} 
                        />
                    </label>

                    <button 
                        onClick={() => {
                            enviarComando("list_tftp_files");
                            setMostrarGestor(!mostrarGestor);
                        }}
                        disabled={!conectado}
                        className="px-3 py-1 bg-cyan-950 hover:bg-cyan-900 disabled:opacity-50 text-cyan-200 border border-cyan-800 font-mono text-xs rounded transition-colors font-bold"
                    >
                        🗄️ EXPLORADOR
                    </button>
                </div>
            </div>

            {/* GUI DEL EXPLORADOR DE ARCHIVOS SIMPLIFICADA */}
            {mostrarGestor && (
                <div className="bg-zinc-900 border-b border-zinc-800 p-3 max-h-48 overflow-y-auto z-10 relative">
                    <h3 className="text-zinc-400 font-mono text-xs font-bold mb-2">ARCHIVOS EN RASPBERRY (/srv/tftp/)</h3>
                    {archivosTftp.length === 0 ? (
                        <p className="text-zinc-600 text-xs font-mono italic">No hay archivos en la memoria temporal.</p>
                    ) : (
                        <div className="flex flex-col gap-1">
                            {archivosTftp.map(archivo => (
                                <div key={archivo} className="flex items-center justify-between bg-zinc-950 px-3 py-2 rounded border border-zinc-800 hover:border-zinc-700">
                                    <span className="text-zinc-300 font-mono text-sm">{archivo}</span>
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => enviarComando("macro_tftp_download", { filename: archivo, os: perfilActivo, raspi_ip: raspiIp })} 
                                            disabled={!consolaActiva}
                                            title={!consolaActiva ? "Abre un puerto serie primero" : `Inyectar macro para ${perfilActivo.toUpperCase()}`}
                                            className={`px-4 py-1.5 font-mono text-xs font-bold tracking-wide rounded transition-all 
                                                ${consolaActiva 
                                                    ? 'bg-emerald-900/40 hover:bg-emerald-800 border border-emerald-800 text-emerald-400' 
                                                    : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                                                }`}
                                        >
                                            ▶️ ENVIAR
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Contenedor Xterm.js */}
            <div className="flex-1 w-full h-96 p-2 bg-[#09090b]">
                <div ref={terminalRef} className="w-full h-full" />
            </div>

            {/* MODAL DE CONEXIÓN MANUAL FLOTANTE */}
            {mostrarModalManual && (
                <div className="absolute inset-0 bg-black/80 flex items-center justify-center p-4 z-[60]">
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 w-full max-w-sm space-y-4 text-xs font-mono shadow-2xl">
                        <h3 className="text-sm font-bold text-cyan-400 tracking-wider mb-4 border-b border-slate-800 pb-2">🛠️ CONEXIÓN SERIE MANUAL</h3>
                        
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
                            <div>
                                <label className="block text-slate-400 mb-1">Perfil para Macros TFTP</label>
                                <select 
                                    value={manualOs} 
                                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setManualOs(e.target.value)} 
                                    className="w-full bg-slate-950 p-2.5 border border-slate-800 rounded-lg text-cyan-300 focus:outline-none focus:border-cyan-500 transition-colors cursor-pointer"
                                >
                                    <option value="cisco">Cisco (copy tftp...)</option>
                                    <option value="fortinet">Fortinet (execute restore...)</option>
                                    <option value="paloalto">PaloAlto (tftp import...)</option>
                                    <option value="otro">Otro (Solo consola, sin macro específico)</option>
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
                                    setPerfilActivo(manualOs);
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