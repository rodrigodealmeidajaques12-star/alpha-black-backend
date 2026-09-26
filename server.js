const express = require("express");
const cors = require("cors");
const path = require("path");
const crypto = require("crypto");

require("dotenv").config({
    path: path.join(__dirname, ".env")
});


const {
    MercadoPagoConfig,
    Payment
} = require("mercadopago");


const {
    createClient
} = require("@supabase/supabase-js");


const app = express();


app.use(cors());

app.use(express.json());


/* ================================
   VARIÁVEIS DE AMBIENTE
================================ */

const accessToken =
    process.env.MERCADO_PAGO_ACCESS_TOKEN;

const supabaseUrl =
    process.env.SUPABASE_URL;

const supabaseSecretKey =
    process.env.SUPABASE_SECRET_KEY;


/* ================================
   VALIDAR CONFIGURAÇÕES
================================ */

console.log(
    "Mercado Pago carregado:",
    accessToken ? "SIM" : "NÃO"
);

console.log(
    "Supabase URL carregada:",
    supabaseUrl ? "SIM" : "NÃO"
);

console.log(
    "Supabase Secret Key carregada:",
    supabaseSecretKey ? "SIM" : "NÃO"
);


if (
    !accessToken ||
    !supabaseUrl ||
    !supabaseSecretKey
) {

    console.error(
        "ERRO: Variáveis de ambiente não carregadas."
    );

    process.exit(1);

}


/* ================================
   SUPABASE
================================ */

const supabase =
    createClient(
        supabaseUrl,
        supabaseSecretKey,
        {
            auth: {
                persistSession: false,
                autoRefreshToken: false
            }
        }
    );


/* ================================
   MERCADO PAGO
================================ */

const client =
    new MercadoPagoConfig({
        accessToken: accessToken
    });


const payment =
    new Payment(client);


/* ================================
   TESTE DO BACKEND
================================ */

app.get(
    "/",

    function(req, res) {

        res.json({
            mensagem:
                "Backend Alpha Black funcionando!"
        });

    }
);


/* ================================
   TESTAR SUPABASE
================================ */

app.get(
    "/teste-supabase",

    async function(req, res) {

        try {

            const {
                data,
                error
            } =
                await supabase
                    .from("products")
                    .select(`
                        id,
                        nome,
                        preco,
                        ativo
                    `)
                    .order(
                        "criado_em",
                        {
                            ascending: true
                        }
                    );


            if (error) {

                throw error;

            }


            res.json({

                sucesso: true,

                produtos: data

            });


        } catch (erro) {

            console.error(
                "Erro Supabase:",
                erro
            );


            res
                .status(500)
                .json({

                    sucesso: false,

                    erro:
                        "Erro ao consultar Supabase.",

                    detalhes:
                        erro.message

                });

        }

    }
);


/* ================================
   VALIDAR USUÁRIO PELO TOKEN
================================ */

async function validarUsuario(
    req
) {

    const authorization =
        req.headers.authorization;


    if (
        !authorization ||
        !authorization.startsWith(
            "Bearer "
        )
    ) {

        throw new Error(
            "Token de autenticação não informado."
        );

    }


    const token =
        authorization
            .substring(7)
            .trim();


    if (!token) {

        throw new Error(
            "Token de autenticação inválido."
        );

    }


    const {
        data,
        error
    } =
        await supabase
            .auth
            .getUser(
                token
            );


    if (
        error ||
        !data ||
        !data.user
    ) {

        console.error(
            "Erro ao validar token:",
            error
        );

        throw new Error(
            "Sessão inválida ou expirada."
        );

    }


    return data.user;

}


/* ================================
   VALIDAR ENDEREÇO
================================ */

function validarEndereco(
    endereco
) {

    if (
        !endereco ||
        typeof endereco !== "object"
    ) {

        throw new Error(
            "Endereço de entrega é obrigatório."
        );

    }


    const dados = {

        nome:
            String(
                endereco.nome || ""
            ).trim(),

        telefone:
            String(
                endereco.telefone || ""
            ).trim(),

        cep:
            String(
                endereco.cep || ""
            ).trim(),

        endereco:
            String(
                endereco.endereco || ""
            ).trim(),

        numero:
            String(
                endereco.numero || ""
            ).trim(),

        bairro:
            String(
                endereco.bairro || ""
            ).trim(),

        cidade:
            String(
                endereco.cidade || ""
            ).trim()

    };


    if (
        !dados.nome ||
        !dados.telefone ||
        !dados.cep ||
        !dados.endereco ||
        !dados.numero ||
        !dados.bairro ||
        !dados.cidade
    ) {

        throw new Error(
            "Preencha todos os dados de entrega."
        );

    }


    return dados;

}


/* ================================
   VALIDAR CARRINHO
================================ */

async function validarCarrinho(
    itens
) {

    if (
        !Array.isArray(itens) ||
        itens.length === 0
    ) {

        throw new Error(
            "Carrinho vazio."
        );

    }


    const itensValidados = [];

    let totalPedido = 0;


    for (
        const item of itens
    ) {

        const produtoId =
            item.produtoId;


        const tamanho =
            String(
                item.tamanho || ""
            )
                .trim()
                .toUpperCase();


        const quantidade =
            Number(
                item.quantidade
            );


        /* ================================
           VALIDAR DADOS
        ================================ */

        if (
            !produtoId ||
            !tamanho ||
            !Number.isInteger(
                quantidade
            ) ||
            quantidade <= 0
        ) {

            throw new Error(
                "Item inválido no carrinho."
            );

        }


        /* ================================
           BUSCAR PRODUTO
        ================================ */

        const {
            data: produto,
            error: erroProduto
        } =
            await supabase
                .from("products")
                .select(`
                    id,
                    nome,
                    preco,
                    ativo
                `)
                .eq(
                    "id",
                    produtoId
                )
                .eq(
                    "ativo",
                    true
                )
                .maybeSingle();


        if (erroProduto) {

            throw erroProduto;

        }


        if (!produto) {

            throw new Error(
                "Um dos produtos não está disponível."
            );

        }


        /* ================================
           BUSCAR VARIANTE
        ================================ */

        const {
            data: variante,
            error: erroVariante
        } =
            await supabase
                .from(
                    "product_variants"
                )
                .select(`
                    id,
                    tamanho,
                    estoque
                `)
                .eq(
                    "produto_id",
                    produto.id
                )
                .eq(
                    "tamanho",
                    tamanho
                )
                .maybeSingle();


        if (erroVariante) {

            throw erroVariante;

        }


        if (!variante) {

            throw new Error(
                `${produto.nome}: tamanho ${tamanho} não existe.`
            );

        }


        /* ================================
           VALIDAR ESTOQUE
        ================================ */

        const estoqueDisponivel =
            Number(
                variante.estoque
            );


        if (
            quantidade >
            estoqueDisponivel
        ) {

            throw new Error(
                `${produto.nome} tamanho ${tamanho}: estoque insuficiente.`
            );

        }


        /* ================================
           CALCULAR PREÇO
        ================================ */

        const precoUnitario =
            Number(
                produto.preco
            );


        const subtotal =
            precoUnitario *
            quantidade;


        totalPedido +=
            subtotal;


        /* ================================
           ITEM VALIDADO
        ================================ */

        itensValidados.push({

            produtoId:
                produto.id,

            nome:
                produto.nome,

            tamanho:
                tamanho,

            quantidade:
                quantidade,

            precoUnitario:
                Number(
                    precoUnitario
                        .toFixed(2)
                ),

            subtotal:
                Number(
                    subtotal
                        .toFixed(2)
                )

        });

    }


    totalPedido =
        Number(
            totalPedido
                .toFixed(2)
        );


    return {

        itens:
            itensValidados,

        total:
            totalPedido

    };

}


/* ================================
   SALVAR PEDIDO
================================ */

async function salvarPedido(
    usuarioId,
    compra,
    endereco
) {

    /* ================================
       CRIAR PEDIDO
    ================================ */

    const {
        data: pedido,
        error: erroPedido
    } =
        await supabase
            .from("orders")
            .insert({

                usuario_id:
                    usuarioId,

                total:
                    compra.total,

                forma_pagamento:
                    "PIX",

                status:
                    "aguardando_pagamento",

                mercado_pago_id:
                    null,

                nome_cliente:
                    endereco.nome,

                telefone:
                    endereco.telefone,

                cep:
                    endereco.cep,

                endereco:
                    endereco.endereco,

                numero:
                    endereco.numero,

                bairro:
                    endereco.bairro,

                cidade:
                    endereco.cidade

            })
            .select()
            .single();


    if (erroPedido) {

        throw erroPedido;

    }


    /* ================================
       CRIAR ITENS
    ================================ */

    const itensPedido =
        compra.itens.map(
            function(item) {

                return {

                    pedido_id:
                        pedido.id,

                    produto_id:
                        item.produtoId,

                    produto_nome:
                        item.nome,

                    tamanho:
                        item.tamanho,

                    quantidade:
                        item.quantidade,

                    preco_unitario:
                        item.precoUnitario

                };

            }
        );


    const {
        error: erroItens
    } =
        await supabase
            .from("order_items")
            .insert(
                itensPedido
            );


    if (erroItens) {

        /*
            Se der erro ao salvar os itens,
            apagamos o pedido incompleto.
        */

        await supabase
            .from("orders")
            .delete()
            .eq(
                "id",
                pedido.id
            );


        throw erroItens;

    }


    return pedido;

}


/* ================================
   CRIAR PIX
================================ */

app.post(
    "/criar-pix",

    async function(req, res) {

        let pedido = null;


        try {

            const {
                endereco,
                itens
            } = req.body;


            /* ================================
               VALIDAR TOKEN / USUÁRIO
            ================================ */

            let usuario;


            try {

                usuario =
                    await validarUsuario(
                        req
                    );

            } catch (
                erroUsuario
            ) {

                return res
                    .status(401)
                    .json({

                        erro:
                            erroUsuario.message

                    });

            }


            /*
                O ID e o e-mail agora vêm
                diretamente do usuário autenticado
                pelo Supabase.
            */

            const usuarioId =
                usuario.id;

            const email =
                usuario.email;


            if (!email) {

                return res
                    .status(401)
                    .json({

                        erro:
                            "Usuário autenticado sem e-mail."

                    });

            }


            /* ================================
               VALIDAR ENDEREÇO
            ================================ */

            let enderecoValidado;


            try {

                enderecoValidado =
                    validarEndereco(
                        endereco
                    );

            } catch (
                erroEndereco
            ) {

                return res
                    .status(400)
                    .json({

                        erro:
                            erroEndereco.message

                    });

            }


            /* ================================
               VALIDAR CARRINHO
            ================================ */

            let compra;


            try {

                compra =
                    await validarCarrinho(
                        itens
                    );

            } catch (
                erroValidacao
            ) {

                return res
                    .status(400)
                    .json({

                        erro:
                            erroValidacao.message

                    });

            }


            if (
                compra.total <= 0
            ) {

                return res
                    .status(400)
                    .json({

                        erro:
                            "Total do pedido inválido."

                    });

            }


            /* ================================
               SALVAR PEDIDO NO SUPABASE
            ================================ */

            pedido =
                await salvarPedido(
                    usuarioId,
                    compra,
                    enderecoValidado
                );


            /* ================================
               DESCRIÇÃO MERCADO PAGO
            ================================ */

            const descricaoPagamento =
                compra.itens
                    .map(
                        function(item) {

                            return (
                                `${item.nome} ${item.tamanho} x${item.quantidade}`
                            );

                        }
                    )
                    .join(", ")
                    .substring(
                        0,
                        200
                    );


            /* ================================
               CRIAR PIX
            ================================ */

            const body = {

                transaction_amount:
                    compra.total,

                description:
                    descricaoPagamento ||
                    "Compra Alpha Black",

                payment_method_id:
                    "pix",

                payer: {

                    email:
                        email

                },

                /*
                    Liga o pagamento do Mercado Pago
                    ao pedido salvo no Supabase.
                    Isso será importante para o webhook.
                */

                external_reference:
                    pedido.id

            };


            const resposta =
                await payment.create({

                    body:
                        body,

                    requestOptions: {

                        idempotencyKey:
                            crypto.randomUUID()

                    }

                });


            /* ================================
               SALVAR ID MERCADO PAGO
            ================================ */

            const {
                error: erroAtualizacao
            } =
                await supabase
                    .from("orders")
                    .update({

                        mercado_pago_id:
                            String(
                                resposta.id
                            )

                    })
                    .eq(
                        "id",
                        pedido.id
                    );


            if (erroAtualizacao) {

                console.error(
                    "Erro ao salvar ID Mercado Pago:",
                    erroAtualizacao
                );

            }


            /* ================================
               DADOS DO PIX
            ================================ */

            const transactionData =
                resposta
                    .point_of_interaction
                    ?.transaction_data;


            /* ================================
               RESPOSTA
            ================================ */

            res.json({

                pedidoId:
                    pedido.id,

                id:
                    resposta.id,

                status:
                    resposta.status,

                statusDetail:
                    resposta.status_detail,

                total:
                    compra.total,

                itens:
                    compra.itens,

                qrCode:
                    transactionData
                        ?.qr_code ||
                    null,

                qrCodeBase64:
                    transactionData
                        ?.qr_code_base64 ||
                    null,

                ticketUrl:
                    transactionData
                        ?.ticket_url ||
                    null

            });


        } catch (erro) {

            console.error(
                "Erro ao criar PIX:",
                erro
            );


            /*
                Se o pedido já foi criado,
                mas o Mercado Pago falhou,
                marcamos como cancelado.
            */

            if (
                pedido &&
                pedido.id
            ) {

                try {

                    await supabase
                        .from("orders")
                        .update({

                            status:
                                "cancelado"

                        })
                        .eq(
                            "id",
                            pedido.id
                        );

                } catch (
                    erroCancelamento
                ) {

                    console.error(
                        "Erro ao cancelar pedido:",
                        erroCancelamento
                    );

                }

            }


            res
                .status(500)
                .json({

                    erro:
                        "Erro ao criar pagamento PIX.",

                    detalhes:
                        erro.message ||
                        "Erro desconhecido"

                });

        }

    }
);


/* ================================
   CONSULTAR PAGAMENTO
================================ */

app.get(
    "/pagamento/:id",

    async function(req, res) {

        try {

            const id =
                req.params.id;


            const resposta =
                await payment.get({
                    id:
                        id
                });


            res.json({

                id:
                    resposta.id,

                status:
                    resposta.status,

                statusDetail:
                    resposta.status_detail,

                dataAprovacao:
                    resposta.date_approved ||
                    null

            });


        } catch (erro) {

            console.error(
                "Erro ao consultar pagamento:",
                erro
            );


            res
                .status(500)
                .json({

                    erro:
                        "Erro ao consultar pagamento."

                });

        }

    }
);


/* ================================
   SERVIDOR
================================ */

const PORT =
    process.env.PORT ||
    3000;


app.listen(
    PORT,

    function() {

        console.log(
            `Servidor Alpha Black rodando na porta ${PORT}`
        );

    }
);