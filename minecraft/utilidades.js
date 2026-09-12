function distancia(a, b) {
    if (
        !a ||
        !b ||
        !Number.isFinite(a.x) ||
        !Number.isFinite(a.y) ||
        !Number.isFinite(a.z) ||
        !Number.isFinite(b.x) ||
        !Number.isFinite(b.y) ||
        !Number.isFinite(b.z)
    ) {
        return Infinity;
    }

    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;

    return Math.sqrt(
        dx * dx +
        dy * dy +
        dz * dz
    );
}


function distanciaHorizontal(a, b) {
    if (
        !a ||
        !b ||
        !Number.isFinite(a.x) ||
        !Number.isFinite(a.z) ||
        !Number.isFinite(b.x) ||
        !Number.isFinite(b.z)
    ) {
        return Infinity;
    }

    const dx = a.x - b.x;
    const dz = a.z - b.z;

    return Math.sqrt(
        dx * dx +
        dz * dz
    );
}


function limitar(
    valor,
    minimo,
    maximo
) {
    if (
        !Number.isFinite(valor) ||
        !Number.isFinite(minimo) ||
        !Number.isFinite(maximo)
    ) {
        return minimo;
    }

    if (minimo > maximo) {
        [minimo, maximo] =
            [maximo, minimo];
    }

    return Math.min(
        Math.max(valor, minimo),
        maximo
    );
}


function numeroValido(valor) {
    return (
        typeof valor === "number" &&
        Number.isFinite(valor)
    );
}


function posicaoValida(posicao) {
    return !!(
        posicao &&
        numeroValido(posicao.x) &&
        numeroValido(posicao.y) &&
        numeroValido(posicao.z)
    );
}


function normalizarPosicao(posicao) {
    if (!posicaoValida(posicao)) {
        return null;
    }

    return {
        x: Number(posicao.x),
        y: Number(posicao.y),
        z: Number(posicao.z)
    };
}


function arredondarPosicao(posicao) {
    if (!posicaoValida(posicao)) {
        return null;
    }

    return {
        x: Math.floor(posicao.x),
        y: Math.floor(posicao.y),
        z: Math.floor(posicao.z)
    };
}


function esperar(ms) {
    const tempo = Math.max(
        0,
        Number(ms) || 0
    );

    return new Promise(
        resolve =>
            setTimeout(
                resolve,
                tempo
            )
    );
}


function normalizarNome(nome) {
    if (
        nome === null ||
        nome === undefined
    ) {
        return "";
    }

    return String(nome)
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_");
}


function textoValido(
    valor,
    tamanhoMaximo = 500
) {
    if (
        typeof valor !== "string"
    ) {
        return false;
    }

    const texto = valor.trim();

    return (
        texto.length > 0 &&
        texto.length <= tamanhoMaximo
    );
}


function inteiroValido(valor) {
    return (
        Number.isInteger(valor) &&
        Number.isFinite(valor)
    );
}


function limitarInteiro(
    valor,
    minimo,
    maximo
) {
    return Math.floor(
        limitar(
            Number(valor) || 0,
            minimo,
            maximo
        )
    );
}


function obterSinal(valor) {
    if (valor > 0) {
        return 1;
    }

    if (valor < 0) {
        return -1;
    }

    return 0;
}


module.exports = {
    distancia,
    distanciaHorizontal,
    limitar,
    numeroValido,
    inteiroValido,
    posicaoValida,
    normalizarPosicao,
    arredondarPosicao,
    esperar,
    normalizarNome,
    textoValido,
    limitarInteiro,
    obterSinal
};