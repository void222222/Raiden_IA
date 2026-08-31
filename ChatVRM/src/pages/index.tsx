// ==========================================================================
// IMPORTAÇÕES (Trazendo as ferramentas do React e do ChatVRM para usar aqui)
// ==========================================================================
import { useContext, useEffect, useState, useRef, useCallback } from "react";
import VrmViewer from "@/components/vrmViewer";
import { ViewerContext } from "@/features/vrmViewer/viewerContext";
import { Introduction } from "@/components/introduction";
import { Meta } from "@/components/meta";
import Sidebar from "@/components/sidebar";
import ChatInput from "@/components/chat/ChatInput";
import ChatMessages from "@/components/chat/ChatMessages";
import { useChat } from "@/hooks/useChat";

export default function Home() {
  // Puxa o 'viewer' (o motor 3D que renderiza a Raiden) do contexto global
  const { viewer } = useContext(ViewerContext);
  
  // ==========================================================================
  // ESTADOS (Variáveis que, quando mudam, atualizam a tela na mesma hora)
  // ==========================================================================
  const [ultimaFala, setUltimaFala] = useState("");
  const [audioUnlocked, setAudioUnlocked] = useState(false); // Navegador bloqueia áudio sozinho, isso controla o desbloqueio
  
  // Controle de quais painéis estão aparecendo na tela
  const [showChat, setShowChat] = useState(false);
  const [showWardrobe, setShowWardrobe] = useState(false);
  const [uiVisible, setUiVisible] = useState(true); // Faz os botões sumirem igual player do YouTube
  
  // Controle do Fundo (Chroma Key ou Imagem)
  const [bgColor, setBgColor] = useState("#00FF00"); 
  const [bgImage, setBgImage] = useState("");
  
  // Guarda os nomes dos arquivos que vêm da sua API em Python
  const [arquivos, setArquivos] = useState<{ modelos: string[], animacoes: string[], fundos: string[] }>({ modelos: [], animacoes: [], fundos: [] });

  // ==========================================================================
  // REFERÊNCIAS (Variáveis que guardam informações nos bastidores sem bugar a tela)
  // ==========================================================================
  const pollingRef = useRef<NodeJS.Timeout>(); // Guarda o "relógio" que fica pingando a API
  const idleTimeoutRef = useRef<NodeJS.Timeout>(); // Guarda o "relógio" de sumir com a interface
  const fileInputRef = useRef<HTMLInputElement>(null); // Referência invisível para o botão de enviar arquivo pro chat
  const uploadWardrobeRef = useRef<HTMLInputElement>(null); // Referência invisível para o botão de upar fundo/avatar

  // ==========================================================================
  // LÓGICA DE CONEXÃO COM A API PYTHON
  // ==========================================================================
  const [apiUrl, setApiUrl] = useState("http://localhost:8000");
  
  // Quando a página carrega, ele descobre se você tá no localhost ou em outro IP na rede
  useEffect(() => {
    if (typeof window !== "undefined") {
      setApiUrl(`http://${window.location.hostname}:8000`);
    }
  }, []);

  // ==========================================================================
  // EFEITO DO MOUSE (Esconde a interface se você ficar parado por 3 segundos)
  // ==========================================================================
  useEffect(() => {
    const handleMouseMove = () => {
      setUiVisible(true); // Se mexeu o mouse, mostra os botões
      if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
      idleTimeoutRef.current = setTimeout(() => { setUiVisible(false); }, 3000); // 3 seg parado = esconde
    };
    window.addEventListener("mousemove", handleMouseMove);
    idleTimeoutRef.current = setTimeout(() => setUiVisible(false), 3000);
    
    // Limpeza para não vazar memória quando a página fechar
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
    };
  }, []);

  // ==========================================================================
  // MOTOR DE FALA E LIP-SYNC (Faz a boca dela mexer junto com o áudio)
  // ==========================================================================
  const playWithLipSync = async (base64: string) => {
    if (!viewer?.model) return;
    
    // Transforma o Base64 que veio do Python num arquivo de áudio "tocável" pelo navegador
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const arrayBuffer = bytes.buffer;
    
    // Manda o modelo 3D falar
    await viewer.model.speak(arrayBuffer, {
      expression: "neutral",
      talk: { style: "talk", speakerX: 0, speakerY: 0, message: "" },
    });
  };

  // Gancho customizado que gerencia o histórico de chat
  const { messages, isLoading, sendMessage, clearMessages, addMessage } = useChat(apiUrl, playWithLipSync);

  // ==========================================================================
  // DESBLOQUEIO DE ÁUDIO DO NAVEGADOR
  // ==========================================================================
  // O Chrome e o Firefox não deixam sites tocarem som sozinhos.
  // Precisamos que você clique pelo menos UMA VEZ na tela para "destravar" a caixa de som.
  useEffect(() => {
    const unlock = () => { setAudioUnlocked(true); document.removeEventListener("click", unlock); };
    document.addEventListener("click", unlock);
    return () => document.removeEventListener("click", unlock);
  }, []);

  // ==========================================================================
  // O "OUVIDO" DO FRONT-END (Pingando a API toda hora)
  // ==========================================================================
  const fetchResposta = async () => {
    try {
      const res = await fetch(`${apiUrl}/proximo_audio`);
      const data = await res.json();
      
      // Se tiver texto, tiver áudio e o navegador estiver destravado, ela fala!
      if (data.texto && data.audio_base64 && audioUnlocked) {
        setUltimaFala(data.texto);
        playWithLipSync(data.audio_base64);
      }
    } catch (e) {} // Falhas de conexão são ignoradas para não spammar o console
  };

  // Roda a função fetchResposta a cada 1000 milissegundos (1 segundo)
  useEffect(() => {
    if (audioUnlocked) pollingRef.current = setInterval(fetchResposta, 1000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [audioUnlocked, apiUrl]);

  // ==========================================================================
  // SISTEMA DO GUARDA-ROUPA E CENÁRIO
  // ==========================================================================
  // Pede pra API a lista de arquivos que estão na pasta public
  const fetchArquivos = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/arquivos`);
      const data = await res.json();
      setArquivos(data);
    } catch (e) { console.error("Erro ao carregar o guarda-roupa:", e); }
  };

  const trocarModelo = (nomeArquivo: string) => { if (viewer) viewer.loadVrm(`/${nomeArquivo}`); };
  
  const tocarAnimacao = async (nomeArquivo: string) => {
    if (viewer && (viewer as any).loadVrma) {
      await (viewer as any).loadVrma(`/${nomeArquivo}`);
    }
  };

  // Troca o fundo. O encodeURIComponent é essencial para nomes de arquivos com espaços!
  const trocarFundo = (tipo: "cor" | "imagem", valor: string) => {
    if (tipo === "cor") {
      setBgImage("");
      setBgColor(valor);
    } else {
      setBgImage(`url('${apiUrl}/midia/${encodeURIComponent(valor)}')`);
    }
  };

  // Pega o arquivo do seu PC e manda pro servidor Python salvar
  const handleUploadWardrobe = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      await fetch(`${apiUrl}/api/upload`, { method: "POST", body: formData });
      alert(`${file.name} foi salvo com sucesso!`);
      fetchArquivos(); // Atualiza a lista na hora
    } catch (err) {
      alert("Erro ao enviar o arquivo.");
    }
    if (uploadWardrobeRef.current) uploadWardrobeRef.current.value = "";
  };

  // ==========================================================================
  // SISTEMA DE CHAT NORMAL E UPLOAD DE ARQUIVOS PRO CONTEXTO
  // ==========================================================================
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Lê um arquivo de texto e injeta no prompt pra Raiden analisar
    const reader = new FileReader();
    reader.onload = async () => {
      const content = reader.result as string;
      const fileName = file.name;
      const fileExt = fileName.split(".").pop()?.toLowerCase();
      const linhas = content.split("\n").length;
      const mensagem = `[ARQUIVO: ${fileName} (${linhas} linhas)]\n\`\`\`${fileExt || ""}\n${content.slice(0, 3000)}\n\`\`\`\n\nAnalise este código e me responda.`;
      
      sendMessage(mensagem);
      addMessage("user", `📎 Enviado: ${fileName}`);
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [sendMessage, addMessage]);

  const handleClearContext = useCallback(() => {
    clearMessages();
    fetch(`${apiUrl}/limpar_contexto`, { method: "POST" }).catch(() => {});
  }, [clearMessages, apiUrl]);

  // ==========================================================================
  // RENDERIZAÇÃO DA TELA (HTML/JSX)
  // ==========================================================================
  return (
    <div
      style={{ 
        width: "100vw", height: "100vh", position: "relative", overflow: "hidden",
        backgroundColor: bgColor,
        backgroundImage: bgImage,
        backgroundSize: "cover",
        backgroundPosition: "center"
      }}
    >
      <Meta />
      {/* Introduction é aquela telinha inicial de configurações da gringa, que a gente ignorou pro projeto local */}
      <Introduction openAiKey="local" koeiroMapKey="" onChangeAiKey={() => {}} onChangeKoeiromapKey={() => {}} />
      
      {/* CAMADA 1: O MODELO 3D DA RAIDEN */}
      <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", zIndex: 10 }}>
        <VrmViewer />
      </div>

      {/* CAMADA 2: INTERFACE DO USUÁRIO (Botões e Menus) */}
      <div className={`transition-opacity duration-700 ${uiVisible ? "opacity-100" : "opacity-0"}`} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", zIndex: 20, pointerEvents: "none" }}>
        
        {/* Menu lateral de configurações (Original do ChatVRM) */}
        <div style={{ pointerEvents: uiVisible ? "auto" : "none" }}><Sidebar /></div>

        {/* BOTÕES FLUTUANTES NO CANTO INFERIOR ESQUERDO */}
        <div style={{ position: "fixed", bottom: 20, left: 20, display: "flex", flexDirection: "column", gap: 10, pointerEvents: uiVisible ? "auto" : "none" }}>
          {/* Botão de Enviar Código/Texto */}
          <button onClick={() => fileInputRef.current?.click()} style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(15, 15, 25, 0.7)", border: "1px solid rgba(176, 38, 255, 0.4)", color: "#b026ff", fontSize: 20, cursor: "pointer", transition: "all 0.3s" }}>📎</button>
          
          {/* Botão de Lixeira (Apagar Memória do Chat) */}
          <button onClick={handleClearContext} style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(15, 15, 25, 0.7)", border: "1px solid rgba(255, 68, 68, 0.4)", color: "#ff4444", fontSize: 20, cursor: "pointer", transition: "all 0.3s" }}>🗑️</button>
          
          {/* Botão de Abrir Guarda-Roupa */}
          <button onClick={() => { setShowWardrobe(!showWardrobe); if(!showWardrobe) fetchArquivos(); setShowChat(false); }} style={{ width: 48, height: 48, borderRadius: "50%", background: showWardrobe ? "#9d4edd" : "rgba(15, 15, 25, 0.7)", border: "1px solid rgba(176, 38, 255, 0.4)", color: showWardrobe ? "white" : "#b026ff", fontSize: 20, cursor: "pointer", transition: "all 0.3s" }}>👗</button>
          
          {/* Botão de Abrir Chat Digitando */}
          <button onClick={() => { setShowChat(!showChat); setShowWardrobe(false); }} style={{ width: 48, height: 48, borderRadius: "50%", background: showChat ? "#4f46e5" : "rgba(15, 15, 25, 0.7)", border: "1px solid rgba(176, 38, 255, 0.4)", color: showChat ? "white" : "#b026ff", fontSize: 20, cursor: "pointer", transition: "all 0.3s" }}>💬</button>
        </div>

        {/* ======================================================= */}
        {/* CAIXA DO GUARDA-ROUPA (Só aparece se o botão for clicado) */}
        {/* ======================================================= */}
        {showWardrobe && (
          <div style={{
            position: "fixed", bottom: 80, left: 80, width: 340, maxHeight: "80vh",
            background: "rgba(15, 15, 25, 0.85)", border: "1px solid rgba(157, 78, 221, 0.5)",
            borderRadius: 16, display: "flex", flexDirection: "column",
            boxShadow: "0 0 30px rgba(157, 78, 221, 0.3)", backdropFilter: "blur(16px)", overflow: "hidden",
            pointerEvents: uiVisible ? "auto" : "none"
          }}>
            {/* Cabeçalho */}
            <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(176, 38, 255, 0.2)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: "#e0d6ff", fontWeight: "bold", fontSize: 14 }}>👗 Estúdio / Camarim</span>
              <button onClick={() => setShowWardrobe(false)} style={{ background: "none", border: "none", color: "#9b8ec4", cursor: "pointer", fontSize: 18 }}>✕</button>
            </div>
            
            {/* Conteúdo com rolagem (Modelos, Animações, Fundos) */}
            <div style={{ padding: 16, overflowY: "auto", flex: 1 }}>
              
              <button onClick={() => uploadWardrobeRef.current?.click()} style={{ width: "100%", padding: "12px", marginBottom: 20, background: "rgba(157, 78, 221, 0.2)", border: "1px dashed #9d4edd", borderRadius: 8, color: "#e0d6ff", cursor: "pointer", fontWeight: "bold" }}>
                📤 Enviar Arquivo Novo
              </button>
              <input ref={uploadWardrobeRef} type="file" onChange={handleUploadWardrobe} style={{ display: "none" }} accept=".vrm,.vrma,.png,.jpg,.jpeg" />

              <h3 style={{ color: "#fff", fontSize: 13, marginBottom: 10, textTransform: "uppercase" }}>Modelos (.vrm)</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                {arquivos.modelos.map(m => (
                  <button key={m} onClick={() => trocarModelo(m)} style={{ padding: "10px", background: "rgba(123, 44, 191, 0.3)", border: "1px solid #9d4edd", borderRadius: 8, color: "#fff", cursor: "pointer", textAlign: "left", fontSize: 13 }}>{m}</button>
                ))}
              </div>

              <h3 style={{ color: "#fff", fontSize: 13, marginBottom: 10, textTransform: "uppercase" }}>Animações (.vrma)</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                {arquivos.animacoes.map(a => (
                  <button key={a} onClick={() => tocarAnimacao(a)} style={{ padding: "10px", background: "rgba(40, 167, 69, 0.3)", border: "1px solid #00ff88", borderRadius: 8, color: "#fff", cursor: "pointer", textAlign: "left", fontSize: 13 }}>▶️ {a}</button>
                ))}
              </div>

              <h3 style={{ color: "#fff", fontSize: 13, marginBottom: 10, textTransform: "uppercase" }}>Fundos</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                <button onClick={() => trocarFundo("cor", "#00FF00")} style={{ padding: "8px", background: "#00FF00", border: "none", borderRadius: 8, color: "#000", fontWeight: "bold", cursor: "pointer" }}>Tela Verde</button>
                <button onClick={() => trocarFundo("cor", "#0000FF")} style={{ padding: "8px", background: "#0000FF", border: "none", borderRadius: 8, color: "#fff", fontWeight: "bold", cursor: "pointer" }}>Tela Azul</button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {arquivos.fundos.map(f => (
                  <button key={f} onClick={() => trocarFundo("imagem", f)} style={{ padding: "10px", background: "rgba(255, 170, 0, 0.3)", border: "1px solid #ffaa00", borderRadius: 8, color: "#fff", cursor: "pointer", textAlign: "left", fontSize: 13 }}>🖼️ {f}</button>
                ))}
              </div>

            </div>
          </div>
        )}

        {/* ======================================================= */}
        {/* CAIXA DE CHAT POR TEXTO (Só aparece se o botão for clicado) */}
        {/* ======================================================= */}
        {showChat && (
          <div style={{ position: "fixed", bottom: 80, left: 80, width: 380, height: 500, background: "rgba(15, 15, 25, 0.75)", border: "1px solid rgba(176, 38, 255, 0.3)", borderRadius: 16, display: "flex", flexDirection: "column", boxShadow: "0 0 30px rgba(138, 43, 226, 0.2)", backdropFilter: "blur(16px)", overflow: "hidden", pointerEvents: uiVisible ? "auto" : "none" }}>
            {/* Cabeçalho do Chat */}
            <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(176, 38, 255, 0.2)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: "#e0d6ff", fontWeight: "bold", fontSize: 14 }}>💬 Chat com Raiden</span>
              <button onClick={() => setShowChat(false)} style={{ background: "none", border: "none", color: "#9b8ec4", cursor: "pointer", fontSize: 18 }}>✕</button>
            </div>
            
            {/* Área onde as mensagens aparecem */}
            <ChatMessages messages={messages} isLoading={isLoading} />
            
            {/* Barra de digitação no fundo */}
            <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "8px 12px", borderTop: "1px solid rgba(176, 38, 255, 0.2)" }}>
              <button onClick={() => fileInputRef.current?.click()} style={{ background: "none", border: "1px solid rgba(176, 38, 255, 0.3)", borderRadius: 8, color: "#b026ff", padding: "8px 10px", cursor: "pointer", fontSize: 16 }}>📎</button>
              <div style={{ flex: 1 }}><ChatInput onSend={sendMessage} isLoading={isLoading} placeholder="Fale com a Raiden..." /></div>
            </div>
          </div>
        )}

      </div>

      {/* REFERÊNCIA INVISÍVEL (HTML) - Serve para o botão de clipe de papel chamar o explorador de arquivos do PC */}
      <input ref={fileInputRef} type="file" onChange={handleFileUpload} style={{ display: "none" }} accept="*/*" />
    </div>
  );
}