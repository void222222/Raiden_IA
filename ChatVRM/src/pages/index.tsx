// ==========================================================================
// IMPORTAÇÕES
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
  // Puxa o viewer (motor 3D que renderiza a Raiden)
  const { viewer } = useContext(ViewerContext);

  // ==========================================================================
  // ESTADOS
  // ==========================================================================
  const [ultimaFala, setUltimaFala] = useState("");
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  const [showChat, setShowChat] = useState(false);
  const [showWardrobe, setShowWardrobe] = useState(false);
  const [uiVisible, setUiVisible] = useState(true);

  const [bgColor, setBgColor] = useState("#00FF00");
  const [bgImage, setBgImage] = useState("");

  const [arquivos, setArquivos] = useState<{
    modelos: string[];
    animacoes: string[];
    fundos: string[];
  }>({
    modelos: [],
    animacoes: [],
    fundos: [],
  });

  // ==========================================================================
  // REFERÊNCIAS
  // ==========================================================================

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingBusyRef = useRef(false);

  const idleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadWardrobeRef = useRef<HTMLInputElement>(null);

  // ==========================================================================
  // CONEXÃO COM A API PYTHON
  // ==========================================================================

  const [apiUrl] = useState(() => {
    if (typeof window === "undefined") {
      return "http://localhost:8000";
    }

    return `http://${window.location.hostname}:8000`;
  });

  // ==========================================================================
  // EFEITO DO MOUSE
  // ==========================================================================

  useEffect(() => {
    const handleMouseMove = () => {
      setUiVisible(true);

      if (idleTimeoutRef.current) {
        clearTimeout(idleTimeoutRef.current);
      }

      idleTimeoutRef.current = setTimeout(() => {
        setUiVisible(false);
      }, 3000);
    };

    window.addEventListener("mousemove", handleMouseMove);

    idleTimeoutRef.current = setTimeout(() => {
      setUiVisible(false);
    }, 3000);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);

      if (idleTimeoutRef.current) {
        clearTimeout(idleTimeoutRef.current);
      }
    };
  }, []);

  // ==========================================================================
  // MOTOR DE FALA E LIP-SYNC
  // ==========================================================================

  const playWithLipSync = useCallback(
    async (base64: string) => {
      if (!viewer?.model) return;

      try {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);

        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }

        const arrayBuffer = bytes.buffer;

        await viewer.model.speak(arrayBuffer, {
          expression: "neutral",
          talk: {
            style: "talk",
            speakerX: 0,
            speakerY: 0,
            message: "",
          },
        });
      } catch (error) {
        console.error("Erro ao reproduzir áudio da Raiden:", error);
      }
    },
    [viewer]
  );

  // ==========================================================================
  // CHAT
  // ==========================================================================

  const {
    messages,
    isLoading,
    sendMessage,
    clearMessages,
  } = useChat(apiUrl, playWithLipSync);

  // ==========================================================================
  // DESBLOQUEIO DE ÁUDIO
  // ==========================================================================

  useEffect(() => {
    const unlock = () => {
      setAudioUnlocked(true);
      document.removeEventListener("click", unlock);
    };

    document.addEventListener("click", unlock);

    return () => {
      document.removeEventListener("click", unlock);
    };
  }, []);

  // ==========================================================================
  // OUVIDO DO FRONT-END
  //
  // Continua sendo usado para:
  // - YouTube
  // - Microfone
  //
  // O chat manual NÃO depende desse polling.
  // ==========================================================================

  const fetchResposta = useCallback(async () => {
    if (!audioUnlocked || pollingBusyRef.current) return;

    pollingBusyRef.current = true;

    try {
      const res = await fetch(`${apiUrl}/proximo_audio`);

      if (!res.ok) {
        return;
      }

      const data = await res.json();

      if (data.texto && data.audio_base64) {
        setUltimaFala(data.texto);
        await playWithLipSync(data.audio_base64);
      }
    } catch (error) {
      // Falhas temporárias de conexão são ignoradas.
    } finally {
      pollingBusyRef.current = false;
    }
  }, [apiUrl, audioUnlocked, playWithLipSync]);

  useEffect(() => {
    if (!audioUnlocked) {
      return;
    }

    pollingRef.current = setInterval(fetchResposta, 1000);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [audioUnlocked, fetchResposta]);

  // ==========================================================================
  // SISTEMA DO GUARDA-ROUPA E CENÁRIO
  // ==========================================================================

  const fetchArquivos = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/arquivos`);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      setArquivos(data);
    } catch (error) {
      console.error("Erro ao carregar o guarda-roupa:", error);
    }
  }, [apiUrl]);

  const trocarModelo = useCallback(
    (nomeArquivo: string) => {
      if (viewer) {
        viewer.loadVrm(`/${nomeArquivo}`);
      }
    },
    [viewer]
  );

  const tocarAnimacao = useCallback(
    async (nomeArquivo: string) => {
      if (viewer && (viewer as any).loadVrma) {
        try {
          await (viewer as any).loadVrma(`/${nomeArquivo}`);
        } catch (error) {
          console.error("Erro ao carregar animação:", error);
        }
      }
    },
    [viewer]
  );

  const trocarFundo = useCallback(
    (tipo: "cor" | "imagem", valor: string) => {
      if (tipo === "cor") {
        setBgImage("");
        setBgColor(valor);
      } else {
        setBgImage(
          `url('${apiUrl}/midia/${encodeURIComponent(valor)}')`
        );
      }
    },
    [apiUrl]
  );

  // ==========================================================================
  // UPLOAD DO GUARDA-ROUPA
  // ==========================================================================

  const handleUploadWardrobe = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];

    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${apiUrl}/api/upload`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        let mensagem = `Erro HTTP ${res.status}`;

        try {
          const data = await res.json();

          if (data.detail) {
            mensagem = data.detail;
          }
        } catch {
          // Mantém a mensagem padrão.
        }

        throw new Error(mensagem);
      }

      alert(`${file.name} foi salvo com sucesso!`);

      await fetchArquivos();
    } catch (error) {
      console.error("Erro ao enviar arquivo:", error);

      alert(
        error instanceof Error
          ? error.message
          : "Erro ao enviar o arquivo."
      );
    } finally {
      if (uploadWardrobeRef.current) {
        uploadWardrobeRef.current.value = "";
      }
    }
  };

  // ==========================================================================
  // UPLOAD DE ARQUIVO PARA O CHAT
  // ==========================================================================

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];

      if (!file) return;

      const reader = new FileReader();

      reader.onload = () => {
        const content = reader.result as string;

        const fileName = file.name;
        const fileExt = fileName
          .split(".")
          .pop()
          ?.toLowerCase();

        const linhas = content.split("\n").length;

        const mensagem =
          `[ARQUIVO: ${fileName} (${linhas} linhas)]\n` +
          `\`\`\`${fileExt || ""}\n` +
          `${content.slice(0, 3000)}\n` +
          `\`\`\`\n\n` +
          `Analise este código e me responda.`;

        // IMPORTANTE:
        // sendMessage já adiciona a mensagem do usuário.
        // Não usamos addMessage aqui para evitar duplicação.
        sendMessage(mensagem);
      };

      reader.onerror = () => {
        console.error("Erro ao ler arquivo:", reader.error);
        alert("Não foi possível ler esse arquivo.");
      };

      reader.readAsText(file);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [sendMessage]
  );

  // ==========================================================================
  // LIMPAR CHAT
  // ==========================================================================

  const handleClearContext = useCallback(() => {
    /*
     * O backend atual não possui /limpar_contexto.
     *
     * Como o useChat mantém o histórico no frontend,
     * limpar as mensagens já limpa o contexto visual da conversa.
     */
    clearMessages();
  }, [clearMessages]);

  // ==========================================================================
  // RENDERIZAÇÃO
  // ==========================================================================

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        position: "relative",
        overflow: "hidden",
        backgroundColor: bgColor,
        backgroundImage: bgImage,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <Meta />

      <Introduction
        openAiKey="local"
        koeiroMapKey=""
        onChangeAiKey={() => {}}
        onChangeKoeiromapKey={() => {}}
      />

      {/* ================================================================ */}
      {/* MODELO 3D */}
      {/* ================================================================ */}

      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          zIndex: 10,
        }}
      >
        <VrmViewer />
      </div>

      {/* ================================================================ */}
      {/* INTERFACE */}
      {/* ================================================================ */}

      <div
        className={`transition-opacity duration-700 ${
          uiVisible ? "opacity-100" : "opacity-0"
        }`}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          zIndex: 20,
          pointerEvents: "none",
        }}
      >
        {/* MENU LATERAL */}

        <div
          style={{
            pointerEvents: uiVisible ? "auto" : "none",
          }}
        >
          <Sidebar />
        </div>

        {/* ============================================================ */}
        {/* BOTÕES FLUTUANTES */}
        {/* ============================================================ */}

        <div
          style={{
            position: "fixed",
            bottom: 20,
            left: 20,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            pointerEvents: uiVisible ? "auto" : "none",
          }}
        >
          {/* ENVIAR ARQUIVO */}

          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              background: "rgba(15, 15, 25, 0.7)",
              border: "1px solid rgba(176, 38, 255, 0.4)",
              color: "#b026ff",
              fontSize: 20,
              cursor: "pointer",
              transition: "all 0.3s",
            }}
          >
            📎
          </button>

          {/* LIMPAR CHAT */}

          <button
            onClick={handleClearContext}
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              background: "rgba(15, 15, 25, 0.7)",
              border: "1px solid rgba(255, 68, 68, 0.4)",
              color: "#ff4444",
              fontSize: 20,
              cursor: "pointer",
              transition: "all 0.3s",
            }}
          >
            🗑️
          </button>

          {/* GUARDA-ROUPA */}

          <button
            onClick={() => {
              setShowWardrobe(!showWardrobe);

              if (!showWardrobe) {
                fetchArquivos();
              }

              setShowChat(false);
            }}
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              background: showWardrobe
                ? "#9d4edd"
                : "rgba(15, 15, 25, 0.7)",
              border: "1px solid rgba(176, 38, 255, 0.4)",
              color: showWardrobe ? "white" : "#b026ff",
              fontSize: 20,
              cursor: "pointer",
              transition: "all 0.3s",
            }}
          >
            👗
          </button>

          {/* CHAT */}

          <button
            onClick={() => {
              setShowChat(!showChat);
              setShowWardrobe(false);
            }}
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              background: showChat
                ? "#4f46e5"
                : "rgba(15, 15, 25, 0.7)",
              border: "1px solid rgba(176, 38, 255, 0.4)",
              color: showChat ? "white" : "#b026ff",
              fontSize: 20,
              cursor: "pointer",
              transition: "all 0.3s",
            }}
          >
            💬
          </button>
        </div>

        {/* ============================================================ */}
        {/* GUARDA-ROUPA */}
        {/* ============================================================ */}

        {showWardrobe && (
          <div
            style={{
              position: "fixed",
              bottom: 80,
              left: 80,
              width: 340,
              maxHeight: "80vh",
              background: "rgba(15, 15, 25, 0.85)",
              border: "1px solid rgba(157, 78, 221, 0.5)",
              borderRadius: 16,
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 0 30px rgba(157, 78, 221, 0.3)",
              backdropFilter: "blur(16px)",
              overflow: "hidden",
              pointerEvents: uiVisible ? "auto" : "none",
            }}
          >
            <div
              style={{
                padding: "12px 16px",
                borderBottom:
                  "1px solid rgba(176, 38, 255, 0.2)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span
                style={{
                  color: "#e0d6ff",
                  fontWeight: "bold",
                  fontSize: 14,
                }}
              >
                👗 Estúdio / Camarim
              </span>

              <button
                onClick={() => setShowWardrobe(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#9b8ec4",
                  cursor: "pointer",
                  fontSize: 18,
                }}
              >
                ✕
              </button>
            </div>

            <div
              style={{
                padding: 16,
                overflowY: "auto",
                flex: 1,
              }}
            >
              <button
                onClick={() =>
                  uploadWardrobeRef.current?.click()
                }
                style={{
                  width: "100%",
                  padding: "12px",
                  marginBottom: 20,
                  background: "rgba(157, 78, 221, 0.2)",
                  border: "1px dashed #9d4edd",
                  borderRadius: 8,
                  color: "#e0d6ff",
                  cursor: "pointer",
                  fontWeight: "bold",
                }}
              >
                📤 Enviar Arquivo Novo
              </button>

              <input
                ref={uploadWardrobeRef}
                type="file"
                onChange={handleUploadWardrobe}
                style={{ display: "none" }}
                accept=".vrm,.vrma,.png,.jpg,.jpeg"
              />

              {/* MODELOS */}

              <h3
                style={{
                  color: "#fff",
                  fontSize: 13,
                  marginBottom: 10,
                  textTransform: "uppercase",
                }}
              >
                Modelos (.vrm)
              </h3>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  marginBottom: 20,
                }}
              >
                {arquivos.modelos.map((m) => (
                  <button
                    key={m}
                    onClick={() => trocarModelo(m)}
                    style={{
                      padding: "10px",
                      background: "rgba(123, 44, 191, 0.3)",
                      border: "1px solid #9d4edd",
                      borderRadius: 8,
                      color: "#fff",
                      cursor: "pointer",
                      textAlign: "left",
                      fontSize: 13,
                    }}
                  >
                    {m}
                  </button>
                ))}
              </div>

              {/* ANIMAÇÕES */}

              <h3
                style={{
                  color: "#fff",
                  fontSize: 13,
                  marginBottom: 10,
                  textTransform: "uppercase",
                }}
              >
                Animações (.vrma)
              </h3>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  marginBottom: 20,
                }}
              >
                {arquivos.animacoes.map((a) => (
                  <button
                    key={a}
                    onClick={() => tocarAnimacao(a)}
                    style={{
                      padding: "10px",
                      background: "rgba(40, 167, 69, 0.3)",
                      border: "1px solid #00ff88",
                      borderRadius: 8,
                      color: "#fff",
                      cursor: "pointer",
                      textAlign: "left",
                      fontSize: 13,
                    }}
                  >
                    ▶️ {a}
                  </button>
                ))}
              </div>

              {/* FUNDOS */}

              <h3
                style={{
                  color: "#fff",
                  fontSize: 13,
                  marginBottom: 10,
                  textTransform: "uppercase",
                }}
              >
                Fundos
              </h3>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                  marginBottom: 10,
                }}
              >
                <button
                  onClick={() =>
                    trocarFundo("cor", "#00FF00")
                  }
                  style={{
                    padding: "8px",
                    background: "#00FF00",
                    border: "none",
                    borderRadius: 8,
                    color: "#000",
                    fontWeight: "bold",
                    cursor: "pointer",
                  }}
                >
                  Tela Verde
                </button>

                <button
                  onClick={() =>
                    trocarFundo("cor", "#0000FF")
                  }
                  style={{
                    padding: "8px",
                    background: "#0000FF",
                    border: "none",
                    borderRadius: 8,
                    color: "#fff",
                    fontWeight: "bold",
                    cursor: "pointer",
                  }}
                >
                  Tela Azul
                </button>
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                {arquivos.fundos.map((f) => (
                  <button
                    key={f}
                    onClick={() => trocarFundo("imagem", f)}
                    style={{
                      padding: "10px",
                      background: "rgba(255, 170, 0, 0.3)",
                      border: "1px solid #ffaa00",
                      borderRadius: 8,
                      color: "#fff",
                      cursor: "pointer",
                      textAlign: "left",
                      fontSize: 13,
                    }}
                  >
                    🖼️ {f}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* CHAT */}
        {/* ============================================================ */}

        {showChat && (
          <div
            style={{
              position: "fixed",
              bottom: 80,
              left: 80,
              width: 380,
              height: 500,
              background: "rgba(15, 15, 25, 0.75)",
              border:
                "1px solid rgba(176, 38, 255, 0.3)",
              borderRadius: 16,
              display: "flex",
              flexDirection: "column",
              boxShadow:
                "0 0 30px rgba(138, 43, 226, 0.2)",
              backdropFilter: "blur(16px)",
              overflow: "hidden",
              pointerEvents: uiVisible ? "auto" : "none",
            }}
          >
            <div
              style={{
                padding: "12px 16px",
                borderBottom:
                  "1px solid rgba(176, 38, 255, 0.2)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span
                style={{
                  color: "#e0d6ff",
                  fontWeight: "bold",
                  fontSize: 14,
                }}
              >
                💬 Chat com Raiden
              </span>

              <button
                onClick={() => setShowChat(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#9b8ec4",
                  cursor: "pointer",
                  fontSize: 18,
                }}
              >
                ✕
              </button>
            </div>

            <ChatMessages
              messages={messages}
              isLoading={isLoading}
            />

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "8px 12px",
                borderTop:
                  "1px solid rgba(176, 38, 255, 0.2)",
              }}
            >
              <button
                onClick={() =>
                  fileInputRef.current?.click()
                }
                style={{
                  background: "none",
                  border:
                    "1px solid rgba(176, 38, 255, 0.3)",
                  borderRadius: 8,
                  color: "#b026ff",
                  padding: "8px 10px",
                  cursor: "pointer",
                  fontSize: 16,
                }}
              >
                📎
              </button>

              <div style={{ flex: 1 }}>
                <ChatInput
                  onSend={sendMessage}
                  isLoading={isLoading}
                  placeholder="Fale com a Raiden..."
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ================================================================ */}
      {/* INPUT INVISÍVEL DE ARQUIVOS */}
      {/* ================================================================ */}

      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileUpload}
        style={{ display: "none" }}
        accept="*/*"
      />
    </div>
  );
}