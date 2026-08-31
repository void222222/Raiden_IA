import { useState } from "react";

type Props = {
  openAiKey: string;
  koeiroMapKey: string;
  onChangeAiKey: (openAiKey: string) => void;
  onChangeKoeiromapKey: (koeiromapKey: string) => void;
};

/**
 * Tela de introdução / boas-vindas.
 * Agora não solicita mais chaves de API, porque a Raiden usa sua própria API local.
 * Mantemos as props para compatibilidade com o restante do código, mas não as utilizamos.
 */
export const Introduction = ({
  openAiKey,
  koeiroMapKey,
  onChangeAiKey,
  onChangeKoeiromapKey,
}: Props) => {
  const [opened, setOpened] = useState(true);

  return opened ? (
    <div className="absolute z-40 w-full h-full px-24 py-40 bg-black/30 font-M_PLUS_2">
      <div className="mx-auto my-auto max-w-3xl max-h-full p-24 overflow-auto bg-white rounded-16">
        <div className="my-24">
          <div className="my-8 font-bold typography-20 text-secondary">
            Raiden 2.0 – Assistente Virtual
          </div>
          <div className="my-16">
            Bem-vindo(a) ao ChatVRM modificado para a <strong>Raiden</strong>, sua parceira tsundere.
            <br />
            Ela roda totalmente local: a IA está no seu computador (Python + Ollama) e o modelo 3D
            é carregado aqui no navegador.
            <br />
            Nenhuma chave de API externa é necessária.
          </div>
        </div>

        <div className="my-24">
          <div className="my-8 font-bold typography-20 text-secondary">
            Como usar
          </div>
          <ul className="list-disc ml-24">
            <li>Escreva sua mensagem no campo abaixo da visualização 3D e pressione Enter.</li>
            <li>Após a resposta aparecer, um botão <strong>🔊 Ouvir Raiden</strong> surgirá no canto inferior direito.</li>
            <li>Clique nele para ouvir a voz da Raiden e ver a boca se mexer!</li>
          </ul>
        </div>

        <div className="my-24">
          <div className="my-8 font-bold typography-20 text-secondary">
            Tecnologias utilizadas
          </div>
          <div>
            <p>• <strong>Modelo 3D:</strong> @pixiv/three-vrm (visualização e lip‑sync)</p>
            <p>• <strong>IA:</strong> Ollama com modelo local (raiden_nova)</p>
            <p>• <strong>Voz:</strong> gTTS (Google Text-to-Speech) → áudio convertido para base64</p>
            <p>• <strong>Frontend:</strong> Next.js + Tailwind CSS</p>
            <p>• <strong>Backend:</strong> FastAPI (Python) rodando no PC do criador</p>
          </div>
        </div>

        <div className="my-24">
          <div className="my-8 font-bold typography-20 text-secondary">
            Personalidade
          </div>
          <div>
            A Raiden é tsundere, sarcástica e levemente implicante. Fale com ela sobre qualquer
            assunto — ela conhece bem o Lucas e sua rotina.
          </div>
        </div>

        <div className="my-24">
          <button
            onClick={() => setOpened(false)}
            className="font-bold bg-secondary hover:bg-secondary-hover active:bg-secondary-press disabled:bg-secondary-disabled text-white px-24 py-8 rounded-oval"
          >
            Entrar (não é necessário chave)
          </button>
        </div>
      </div>
    </div>
  ) : null;
};