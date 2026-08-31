import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";

type Tab = "dossies" | "anotacoes" | "agenda";

interface Dossie {
  nome: string;
  pasta: string;
  conteudo: string;
  tamanho: number;
}

interface Anotacao {
  autor: string;
  mensagem: string;
  data: string;
}

interface Tarefa {
  tarefa: string;
  data: string;
}

export default function Sidebar() {
  const [aberto, setAberto] = useState(false);
  const [tabAtiva, setTabAtiva] = useState<Tab>("dossies");
  
  // Dados
  const [dossies, setDossies] = useState<Dossie[]>([]);
  const [dossieSelecionado, setDossieSelecionado] = useState<Dossie | null>(null);
  const [anotacoes, setAnotacoes] = useState<Anotacao[]>([]);
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [carregando, setCarregando] = useState(false);

  // 🌐 URL dinâmica (calculada apenas no cliente, nunca no SSR)
  const [apiUrl, setApiUrl] = useState("http://localhost:8000");

  useEffect(() => {
    // Só executa no cliente (browser), nunca no servidor
    if (typeof window !== "undefined") {
      setApiUrl(`http://${window.location.hostname}:8000`);
    }
  }, []);

  // Buscar dados quando a tab mudar
  useEffect(() => {
    if (!aberto) return;
    
    setCarregando(true);
    
    if (tabAtiva === "dossies") {
      fetch(`${apiUrl}/api/dossies`)
        .then(r => r.json())
        .then(data => setDossies(data.dossies || []))
        .catch(err => console.error("Erro ao buscar dossiês:", err))
        .finally(() => setCarregando(false));
    } else if (tabAtiva === "anotacoes") {
      fetch(`${apiUrl}/api/anotacoes`)
        .then(r => r.json())
        .then(data => setAnotacoes(data.anotacoes || []))
        .catch(err => console.error("Erro ao buscar anotações:", err))
        .finally(() => setCarregando(false));
    } else if (tabAtiva === "agenda") {
      fetch(`${apiUrl}/api/agenda`)
        .then(r => r.json())
        .then(data => setTarefas(data.tarefas || []))
        .catch(err => console.error("Erro ao buscar agenda:", err))
        .finally(() => setCarregando(false));
    }
  }, [tabAtiva, aberto, apiUrl]);

  // Estilos
  const sidebarStyle: React.CSSProperties = {
    position: "fixed",
    top: 0,
    right: aberto ? 0 : -420,
    width: 420,
    height: "100vh",
    background: "linear-gradient(180deg, #1a1a2e 0%, #16213e 100%)",
    borderLeft: "2px solid #4f46e5",
    zIndex: 9999,
    transition: "right 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
    display: "flex",
    flexDirection: "column",
    boxShadow: "-10px 0 40px rgba(0,0,0,0.5)",
  };

  const tabStyle = (tab: Tab): React.CSSProperties => ({
    flex: 1,
    padding: "12px 8px",
    background: tabAtiva === tab ? "#4f46e5" : "transparent",
    color: "white",
    border: "none",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: tabAtiva === tab ? "bold" : "normal",
    borderRadius: 8,
    transition: "all 0.2s",
  });

  const btnToggleStyle: React.CSSProperties = {
    position: "fixed",
    top: 20,
    right: aberto ? 440 : 20,
    width: 48,
    height: 48,
    borderRadius: "50%",
    background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
    border: "2px solid rgba(255,255,255,0.3)",
    color: "white",
    fontSize: 24,
    cursor: "pointer",
    zIndex: 10000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.3s",
    boxShadow: "0 4px 20px rgba(79, 70, 229, 0.4)",
  };

  return (
    <>
      {/* Botão Toggle */}
      <button
        style={btnToggleStyle}
        onClick={() => setAberto(!aberto)}
        title="Dashboard de Comando"
      >
        {aberto ? "✕" : "☰"}
      </button>

      {/* Painel Lateral */}
      <div style={sidebarStyle}>
        {/* Cabeçalho */}
        <div style={{ padding: "20px", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
          <h2 style={{ color: "white", margin: 0, fontSize: 20, fontWeight: "bold" }}>
            🎌 Dashboard Raiden
          </h2>
          <p style={{ color: "#94a3b8", margin: "4px 0 0", fontSize: 12 }}>
            Comando Central de Dados
          </p>
        </div>

        {/* Tabs */}
        <div style={{
          display: "flex",
          gap: 6,
          padding: "12px",
          background: "rgba(0,0,0,0.3)",
        }}>
          <button style={tabStyle("dossies")} onClick={() => { setTabAtiva("dossies"); setDossieSelecionado(null); }}>
            📑 Dossiês
          </button>
          <button style={tabStyle("anotacoes")} onClick={() => setTabAtiva("anotacoes")}>
            📝 Anotações
          </button>
          <button style={tabStyle("agenda")} onClick={() => setTabAtiva("agenda")}>
            📅 Agenda
          </button>
        </div>

        {/* Conteúdo */}
        <div style={{
          flex: 1,
          overflow: "auto",
          padding: "16px",
          color: "white",
        }}>
          {carregando && (
            <div style={{ textAlign: "center", color: "#94a3b8", padding: 40 }}>
              ⏳ Carregando...
            </div>
          )}

          {/* Tab Dossiês */}
          {tabAtiva === "dossies" && !carregando && (
            <>
              {dossieSelecionado ? (
                <div>
                  <button
                    onClick={() => setDossieSelecionado(null)}
                    style={{
                      background: "rgba(255,255,255,0.1)",
                      border: "none",
                      color: "white",
                      padding: "8px 16px",
                      borderRadius: 8,
                      cursor: "pointer",
                      marginBottom: 16,
                      fontSize: 14,
                    }}
                  >
                    ← Voltar para lista
                  </button>
                  <div style={{
                    background: "rgba(255,255,255,0.05)",
                    borderRadius: 12,
                    padding: 20,
                    fontSize: 14,
                    lineHeight: 1.7,
                    maxHeight: "calc(100vh - 250px)",
                    overflow: "auto",
                  }}>
                    <ReactMarkdown>{dossieSelecionado.conteudo}</ReactMarkdown>
                  </div>
                </div>
              ) : (
                <div>
                  <p style={{ color: "#94a3b8", fontSize: 13, marginBottom: 12 }}>
                    {dossies.length} dossiês encontrados
                  </p>
                  {dossies.map((d, i) => (
                    <div
                      key={i}
                      onClick={() => setDossieSelecionado(d)}
                      style={{
                        background: "rgba(255,255,255,0.05)",
                        borderRadius: 10,
                        padding: 14,
                        marginBottom: 8,
                        cursor: "pointer",
                        border: "1px solid rgba(255,255,255,0.08)",
                        transition: "all 0.2s",
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = "rgba(79, 70, 229, 0.2)"}
                      onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                    >
                      <div style={{ fontWeight: "bold", fontSize: 15 }}>📄 {d.nome}</div>
                      <div style={{ color: "#94a3b8", fontSize: 11, marginTop: 4 }}>
                        {d.tamanho.toLocaleString()} caracteres
                      </div>
                    </div>
                  ))}
                  {dossies.length === 0 && (
                    <p style={{ color: "#64748b", textAlign: "center", padding: 40 }}>
                      Nenhum dossiê encontrado. Use o Grande Sábio para criar um!
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          {/* Tab Anotações */}
          {tabAtiva === "anotacoes" && !carregando && (
            <div>
              <p style={{ color: "#94a3b8", fontSize: 13, marginBottom: 12 }}>
                {anotacoes.length} anotações
              </p>
              {anotacoes.map((a, i) => (
                <div
                  key={i}
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    borderRadius: 10,
                    padding: 14,
                    marginBottom: 8,
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <div style={{ fontSize: 14, lineHeight: 1.5 }}>{a.mensagem}</div>
                  <div style={{ color: "#64748b", fontSize: 11, marginTop: 6 }}>
                    🕐 {a.data}
                  </div>
                </div>
              ))}
              {anotacoes.length === 0 && (
                <p style={{ color: "#64748b", textAlign: "center", padding: 40 }}>
                  Nenhuma anotação ainda.
                </p>
              )}
            </div>
          )}

          {/* Tab Agenda */}
          {tabAtiva === "agenda" && !carregando && (
            <div>
              <p style={{ color: "#94a3b8", fontSize: 13, marginBottom: 12 }}>
                {tarefas.length} tarefas
              </p>
              {tarefas.map((t, i) => (
                <div
                  key={i}
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    borderRadius: 10,
                    padding: 14,
                    marginBottom: 8,
                    border: "1px solid rgba(255,255,255,0.08)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div style={{ fontSize: 14, flex: 1 }}>{t.tarefa}</div>
                  <div style={{
                    color: "#4f46e5",
                    fontSize: 11,
                    fontWeight: "bold",
                    background: "rgba(79, 70, 229, 0.2)",
                    padding: "4px 10px",
                    borderRadius: 20,
                  }}>
                    📅 {t.data}
                  </div>
                </div>
              ))}
              {tarefas.length === 0 && (
                <p style={{ color: "#64748b", textAlign: "center", padding: 40 }}>
                  Agenda vazia.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Rodapé - SEM variável dinâmica para evitar Hydration Mismatch */}
        <div style={{
          padding: "12px 20px",
          borderTop: "1px solid rgba(255,255,255,0.1)",
          color: "#64748b",
          fontSize: 11,
          textAlign: "center",
        }}>
          Raiden Dashboard v1.0 • Comando Central
        </div>
      </div>
    </>
  );
}