# Fontes do THITO

As quatro famílias são servidas do próprio projeto, não de CDN. O hub precisa abrir
offline, e uma fonte que não carrega vira fallback silencioso — o desenho quebra sem
avisar. Só os subconjuntos **latin** e **latin-ext** foram baixados: é o que o português
usa, e corta o arquivo pela metade.

| Família | Papel no projeto | Autoria |
|---|---|---|
| **Teko** | Números grandes, relógio, marca — o mostrador do HUD | Indian Type Foundry |
| **Chakra Petch** | Títulos, botões, prosa — a voz da interface | Cadson Demak |
| **Saira Condensed** | Rótulos, linhas de lista, tabelas — onde falta largura | Omnibus-Type |
| **IBM Plex Mono** | Dados, horas, códigos, roteiro do teleprompter | IBM Corp. |

Todas são distribuídas sob a **SIL Open Font License 1.1**, que permite hospedar e
redistribuir junto com o projeto. O texto da licença está em `OFL.txt`.

Para atualizar ou acrescentar pesos, o script que gerou `styles/fontes.css` baixa do
Google Fonts e reescreve os caminhos para cá.
