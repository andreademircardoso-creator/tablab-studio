# TabLab Studio

Web app pessoal para estudo de tablaturas de contrabaixo.

## 0.2 — Áudio local → TAB
- Importa MP3/WAV/M4A pelo navegador.
- Analisa o áudio localmente com detecção de pitch e estima uma linha de baixo.
- Converte notas detectadas em posições de TAB para baixo de 4 cordas E-A-D-G.
- Permite revisar e editar a TAB gerada.
- Não baixa áudio do YouTube e não envia o arquivo para servidor.

A transcrição é experimental: resultados dependem da mixagem, afinação e presença de outros instrumentos. O usuário deve revisar a TAB.

## Desenvolvimento
`npm install`
`npm run dev`

## Publicação
O projeto usa GitHub Pages via GitHub Actions.
