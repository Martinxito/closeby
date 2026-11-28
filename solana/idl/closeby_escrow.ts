/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/closeby_escrow.json`.
 */
export type ClosebyEscrow = {
  "address": "4vaVcMbVh5czXPMw3w6FCp8AFjNNuVtaquppq6ZEzugT",
  "metadata": {
    "name": "closebyEscrow",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Closeby escrow: protected payments for digital goods on Solana"
  },
  "instructions": [
    {
      "name": "buyerCancel",
      "docs": [
        "The buyer changes their mind before unlocking the file: full refund."
      ],
      "discriminator": [
        110,
        82,
        216,
        227,
        40,
        38,
        49,
        69
      ],
      "accounts": [
        {
          "name": "caller",
          "docs": [
            "buyer_cancel: must be the buyer. refund_after_deadline: anyone."
          ],
          "signer": true
        },
        {
          "name": "order",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "order.seller",
                "account": "order"
              },
              {
                "kind": "account",
                "path": "order.orderId",
                "account": "order"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "order"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "buyerToken",
          "docs": [
            "Must belong to the recorded buyer: the caller cannot redirect the refund."
          ],
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "confirmHandover",
      "docs": [
        "The buyer got the file and presses \"Recibí el archivo\": the seller is paid."
      ],
      "discriminator": [
        208,
        188,
        83,
        62,
        124,
        176,
        6,
        49
      ],
      "accounts": [
        {
          "name": "caller",
          "docs": [
            "confirm_handover: must be the buyer. release_after_deadline: anyone."
          ],
          "signer": true
        },
        {
          "name": "order",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "order.seller",
                "account": "order"
              },
              {
                "kind": "account",
                "path": "order.orderId",
                "account": "order"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "order"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "sellerToken",
          "docs": [
            "Must belong to the recorded seller: the caller cannot redirect the payment."
          ],
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "createOrder",
      "docs": [
        "The seller puts a file up for sale. Creates the order and its empty vault.",
        "`content_hash` is the SHA-256 of the file: public proof of what was sold."
      ],
      "discriminator": [
        141,
        54,
        37,
        207,
        237,
        210,
        250,
        215
      ],
      "accounts": [
        {
          "name": "payer",
          "docs": [
            "Our server's fee payer: pays the rent of the order and the vault."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "seller",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "order",
          "docs": [
            "`init` fails if this seller already used this order_id, so an order can never be overwritten."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "seller"
              },
              {
                "kind": "arg",
                "path": "orderId"
              }
            ]
          }
        },
        {
          "name": "vault",
          "docs": [
            "The vault: a USDC account owned by the order PDA. Nobody holds its key."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "order"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "orderId",
          "type": "u64"
        },
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "kind",
          "type": {
            "defined": {
              "name": "orderKind"
            }
          }
        },
        {
          "name": "contentHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "fund",
      "docs": [
        "The buyer pays. The exact order amount moves from the buyer's USDC account into",
        "the vault, and the claim window starts."
      ],
      "discriminator": [
        218,
        188,
        111,
        221,
        152,
        113,
        174,
        7
      ],
      "accounts": [
        {
          "name": "buyer",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "order",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "order.seller",
                "account": "order"
              },
              {
                "kind": "account",
                "path": "order.orderId",
                "account": "order"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "buyerToken",
          "docs": [
            "The buyer's USDC: must be theirs and of the right token."
          ],
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "order"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "initConfig",
      "docs": [
        "One-time setup right after deploy. Only the program's upgrade authority (the",
        "account that deployed it) can call it, so nobody can front-run us and become admin.",
        "The physical windows are stored now so in-person orders can be added later",
        "without migrating this account."
      ],
      "discriminator": [
        23,
        235,
        115,
        232,
        168,
        96,
        1,
        231
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "program",
          "docs": [
            "Proves `admin` is the program's upgrade authority (whoever deployed it)."
          ],
          "address": "4vaVcMbVh5czXPMw3w6FCp8AFjNNuVtaquppq6ZEzugT"
        },
        {
          "name": "programData"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "acceptWindowSecs",
          "type": "i64"
        },
        {
          "name": "graceSecs",
          "type": "i64"
        },
        {
          "name": "digitalClaimSecs",
          "type": "i64"
        },
        {
          "name": "digitalReviewSecs",
          "type": "i64"
        }
      ]
    },
    {
      "name": "openDelivery",
      "docs": [
        "The buyer unlocks the file. Point of no return: from here the buyer can only",
        "confirm, and if they stay silent the seller is paid when the review window ends.",
        "Our server hands out the download link only after it sees this on-chain."
      ],
      "discriminator": [
        36,
        20,
        127,
        119,
        57,
        240,
        240,
        18
      ],
      "accounts": [
        {
          "name": "buyer",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "order",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "order.seller",
                "account": "order"
              },
              {
                "kind": "account",
                "path": "order.orderId",
                "account": "order"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "refundAfterDeadline",
      "docs": [
        "The buyer paid but never unlocked the file in time: full refund.",
        "Anyone can trigger it, but the money only ever goes to the buyer."
      ],
      "discriminator": [
        175,
        189,
        26,
        90,
        209,
        113,
        41,
        159
      ],
      "accounts": [
        {
          "name": "caller",
          "docs": [
            "buyer_cancel: must be the buyer. refund_after_deadline: anyone."
          ],
          "signer": true
        },
        {
          "name": "order",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "order.seller",
                "account": "order"
              },
              {
                "kind": "account",
                "path": "order.orderId",
                "account": "order"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "order"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "buyerToken",
          "docs": [
            "Must belong to the recorded buyer: the caller cannot redirect the refund."
          ],
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "releaseAfterDeadline",
      "docs": [
        "The buyer unlocked the file and stayed silent past the review window: the seller",
        "is paid. Anyone can trigger it, but the money only ever goes to the seller."
      ],
      "discriminator": [
        2,
        177,
        21,
        56,
        128,
        99,
        102,
        98
      ],
      "accounts": [
        {
          "name": "caller",
          "docs": [
            "confirm_handover: must be the buyer. release_after_deadline: anyone."
          ],
          "signer": true
        },
        {
          "name": "order",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "order.seller",
                "account": "order"
              },
              {
                "kind": "account",
                "path": "order.orderId",
                "account": "order"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "order"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "sellerToken",
          "docs": [
            "Must belong to the recorded seller: the caller cannot redirect the payment."
          ],
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "config",
      "discriminator": [
        155,
        12,
        170,
        224,
        30,
        250,
        204,
        130
      ]
    },
    {
      "name": "order",
      "discriminator": [
        134,
        173,
        223,
        185,
        77,
        86,
        28,
        51
      ]
    }
  ],
  "events": [
    {
      "name": "orderCreated",
      "discriminator": [
        224,
        1,
        229,
        63,
        254,
        60,
        190,
        159
      ]
    },
    {
      "name": "orderDelivered",
      "discriminator": [
        235,
        100,
        90,
        112,
        48,
        114,
        170,
        75
      ]
    },
    {
      "name": "orderFunded",
      "discriminator": [
        33,
        168,
        21,
        171,
        46,
        9,
        84,
        49
      ]
    },
    {
      "name": "orderRefunded",
      "discriminator": [
        120,
        155,
        10,
        169,
        7,
        98,
        202,
        187
      ]
    },
    {
      "name": "orderReleased",
      "discriminator": [
        171,
        232,
        93,
        217,
        184,
        222,
        234,
        29
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalidAmount",
      "msg": "Amount must be greater than zero."
    },
    {
      "code": 6001,
      "name": "invalidContentHash",
      "msg": "A digital order needs the SHA-256 of its file."
    },
    {
      "code": 6002,
      "name": "buyerIsSeller",
      "msg": "The seller cannot buy their own deal."
    },
    {
      "code": 6003,
      "name": "invalidStatus",
      "msg": "The order is not in the right status for this action."
    },
    {
      "code": 6004,
      "name": "notBuyer",
      "msg": "Only the buyer can do this."
    },
    {
      "code": 6005,
      "name": "claimWindowClosed",
      "msg": "The time to unlock the file has passed."
    },
    {
      "code": 6006,
      "name": "deadlineNotReached",
      "msg": "The deadline for this action has not been reached yet."
    },
    {
      "code": 6007,
      "name": "physicalNotSupported",
      "msg": "In-person orders are not supported yet."
    },
    {
      "code": 6008,
      "name": "invalidConfig",
      "msg": "All config windows must be greater than zero."
    },
    {
      "code": 6009,
      "name": "unauthorized",
      "msg": "Only the program's upgrade authority can do this."
    },
    {
      "code": 6010,
      "name": "wrongMint",
      "msg": "Wrong token mint."
    },
    {
      "code": 6011,
      "name": "wrongTokenAccount",
      "msg": "The token account does not belong to the right person or token."
    },
    {
      "code": 6012,
      "name": "overflow",
      "msg": "Arithmetic overflow."
    }
  ],
  "types": [
    {
      "name": "config",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "usdcMint",
            "docs": [
              "The only token the program accepts (our test USDC on Devnet, 6 decimals)."
            ],
            "type": "pubkey"
          },
          {
            "name": "acceptWindowSecs",
            "docs": [
              "In-person (reserved): time the seller has to accept a meeting."
            ],
            "type": "i64"
          },
          {
            "name": "graceSecs",
            "docs": [
              "In-person (reserved): time after the meeting before a refund is possible."
            ],
            "type": "i64"
          },
          {
            "name": "digitalClaimSecs",
            "docs": [
              "Digital: time the buyer has to unlock the file after paying (demo: 600)."
            ],
            "type": "i64"
          },
          {
            "name": "digitalReviewSecs",
            "docs": [
              "Digital: time the buyer has to confirm after unlocking (demo: 300)."
            ],
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "order",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "orderId",
            "docs": [
              "The public deal ID in /deals/[dealId]. Random u64, scoped to the seller."
            ],
            "type": "u64"
          },
          {
            "name": "seller",
            "type": "pubkey"
          },
          {
            "name": "buyer",
            "docs": [
              "Set when the order is funded."
            ],
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "docs": [
              "USDC base units (6 decimals)."
            ],
            "type": "u64"
          },
          {
            "name": "kind",
            "type": {
              "defined": {
                "name": "orderKind"
              }
            }
          },
          {
            "name": "contentHash",
            "docs": [
              "SHA-256 of the file being sold. Never all zeros for a digital order."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "orderStatus"
              }
            }
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "claimDeadline",
            "docs": [
              "Digital: the buyer must unlock before this (unix seconds). 0 until funded."
            ],
            "type": "i64"
          },
          {
            "name": "releaseDeadline",
            "docs": [
              "Digital: after this the seller can be paid (unix seconds). 0 until delivered."
            ],
            "type": "i64"
          },
          {
            "name": "meetingTime",
            "docs": [
              "In-person (reserved, zero for digital)."
            ],
            "type": "i64"
          },
          {
            "name": "placeHash",
            "docs": [
              "In-person (reserved): SHA-256 of the meeting place. The place itself stays off-chain."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "acceptDeadline",
            "docs": [
              "In-person (reserved)."
            ],
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "orderCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "order",
            "type": "pubkey"
          },
          {
            "name": "seller",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "contentHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "orderDelivered",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "order",
            "type": "pubkey"
          },
          {
            "name": "releaseDeadline",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "orderFunded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "order",
            "type": "pubkey"
          },
          {
            "name": "buyer",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "claimDeadline",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "orderKind",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "physical"
          },
          {
            "name": "digital"
          }
        ]
      }
    },
    {
      "name": "orderRefunded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "order",
            "type": "pubkey"
          },
          {
            "name": "buyer",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "orderReleased",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "order",
            "type": "pubkey"
          },
          {
            "name": "seller",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "orderStatus",
      "docs": [
        "`Scheduled` is reserved for in-person orders; digital orders never reach it."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "created"
          },
          {
            "name": "funded"
          },
          {
            "name": "scheduled"
          },
          {
            "name": "delivered"
          },
          {
            "name": "released"
          },
          {
            "name": "refunded"
          }
        ]
      }
    }
  ]
};
