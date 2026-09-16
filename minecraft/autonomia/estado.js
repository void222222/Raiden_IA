/**
 * 🧠 ESTADO — AUTONOMIA
 *
 * Encapsula todo o estado mutável do motor.
 * Nenhum outro módulo guarda estado próprio.
 *
 * Isso evita o bug clássico de "estado espalhado":
 * quando 5 módulos guardam pedaços da mesma coisa,
 * fica impossível saber quem é a fonte da verdade.
 *
 * ⚠️ AJUSTE APLICADO:
 *
 * Adicionado `ultimoInventario` — snapshot do inventário
 * na última verificação de progresso.
 *
 * Motivo: o executor agora considera "progresso real"
 * não só quando o bot anda, mas também quando o
 * inventário muda (coletou/craftou algo). Isso evita
 * o falso "travado" enquanto o bot quebra troncos.
 */

const { MOTIVO } = require("./constantes");

function criarEstado() {
    let ativa = false;
    let intervalo = null;

    let estadoAtual = "parada";
    let motivo = MOTIVO.NENHUM;

    let metaAtual = null;
    let planoAtual = [];
    let indiceTarefa = 0;
    let falhasNaTarefaAtual = 0;

    let iniciadoEm = null;
    let ultimaDecisao = null;

    let ultimaPosicao = null;
    let ultimoMovimento = null;
    let ultimoInventario = null;

    let acaoAtual = null;
    let acaoExecutando = false;

    let bloqueandoDecisao = false;

    let ultimaAcaoFalha = null;
    let falhasConsecutivas = 0;
    let bloqueioAte = 0;

    // =========================================================
    // 🔍 LEITURA
    // =========================================================

    function obter() {
        return {
            ativa,
            estado: estadoAtual,
            motivo,
            metaAtual,
            planoAtual,
            indiceTarefa,
            tarefaAtual: planoAtual[indiceTarefa] || null,
            totalTarefas: planoAtual.length,
            falhasNaTarefaAtual,
            iniciadoEm,
            ultimaDecisao,
            ultimaPosicao,
            ultimoMovimento,
            ultimoInventario,
            acaoAtual,
            acaoExecutando,
            bloqueandoDecisao,
            ultimaAcaoFalha,
            falhasConsecutivas,
            bloqueioAte
        };
    }

    function estaAtiva() { return ativa; }
    function estaBloqueandoDecisao() { return bloqueandoDecisao; }
    function temAcaoExecutando() { return acaoExecutando; }
    function obterIntervalo() { return intervalo; }

    function tarefaAtual() {
        return planoAtual[indiceTarefa] || null;
    }

    // =========================================================
    // ✏️ ESCRITA
    // =========================================================

    function definirAtiva(v) { ativa = !!v; }
    function definirIntervalo(v) { intervalo = v; }
    function definirEstado(v) { estadoAtual = v; }
    function definirMotivo(v) { motivo = v; }
    function definirMeta(v) { metaAtual = v; }
    function definirPlano(v) { planoAtual = Array.isArray(v) ? v : []; }
    function definirIndiceTarefa(v) { indiceTarefa = v; }
    function reiniciarIndiceTarefa() { indiceTarefa = 0; }
    function avancarTarefa() { indiceTarefa++; }
    function definirFalhasTarefa(v) { falhasNaTarefaAtual = v; }
    function incrementarFalhasTarefa() { falhasNaTarefaAtual++; }
    function resetarFalhasTarefa() { falhasNaTarefaAtual = 0; }
    function definirIniciadoEm(v) { iniciadoEm = v; }
    function definirUltimaDecisao(v) { ultimaDecisao = v; }
    function definirUltimaPosicao(v) { ultimaPosicao = v; }
    function definirUltimoMovimento(v) { ultimoMovimento = v; }
    function definirUltimoInventario(v) { ultimoInventario = v; }
    function definirBloqueandoDecisao(v) { bloqueandoDecisao = !!v; }

    function registrarAcao(v) {
        acaoAtual = v;
        acaoExecutando = true;
    }

    function limparAcao() {
        acaoAtual = null;
        acaoExecutando = false;
    }

    function registrarFalha(v) {
        ultimaAcaoFalha = v;
    }

    function incrementarFalhasConsecutivas() {
        falhasConsecutivas++;
    }

    function definirBloqueioAte(v) {
        bloqueioAte = v;
    }

    function limparFalhas() {
        ultimaAcaoFalha = null;
        falhasConsecutivas = 0;
        bloqueioAte = 0;
    }

    function resetar() {
        falhasNaTarefaAtual = 0;
        ultimaAcaoFalha = null;
        falhasConsecutivas = 0;
        bloqueioAte = 0;
        ultimoInventario = null;
    }

    return {
        obter,
        estaAtiva,
        estaBloqueandoDecisao,
        temAcaoExecutando,
        obterIntervalo,
        tarefaAtual,

        definirAtiva,
        definirIntervalo,
        definirEstado,
        definirMotivo,
        definirMeta,
        definirPlano,
        definirIndiceTarefa,
        reiniciarIndiceTarefa,
        avancarTarefa,
        definirFalhasTarefa,
        incrementarFalhasTarefa,
        resetarFalhasTarefa,
        definirIniciadoEm,
        definirUltimaDecisao,
        definirUltimaPosicao,
        definirUltimoMovimento,
        definirUltimoInventario,
        definirBloqueandoDecisao,

        registrarAcao,
        limparAcao,
        registrarFalha,
        incrementarFalhasConsecutivas,
        definirBloqueioAte,
        limparFalhas,
        resetar
    };
}

module.exports = { criarEstado };