# Ordem Vitaeternus - VTT

Um Virtual Tabletop (VTT) customizado feito para mim e meus amigos jogarmos nossa mesa de RPG de ordem paranormal, desenvolvido para rodar em redes locais, estou utilizando um Rasp Pi 3. Focado em simplicidade, imersão e diversão, não gostamos muito das opções que achamos pela internet, então resolvi fazer esse.

## Funcionalidades

- **Sincronização em Tempo Real:** Movimentação de tokens, desenhos e troca de mapas sincronizados para todos os jogadores usando Socket.IO.
- **Sistema de Camadas (Layers):** Controle total de profundidade.
- **Ferramentas de Mestre:**
  - **Câmera Livre:** Zoom fluidos integrados ao mouse.
  - **Laser e Medição:** Distância em metros com base na escala do mapa.
  - **Caneta e Borracha Vetorial:** Desenhos livres e opção de apagar traços instantaneamente de forma limpa (estou usando vetor SVG).
  - **Efeitos (Emojis):** Adicionar fogo, fumaça, áreas mágicas e armadilhas ao cenário usando Emojis vetoriais, para não ter muito custo de performance.
  - **Grid Ajustável:** Malha de cenário com medidas configuráveis (X e Y)
- **Gestão de Personagens:** Upload de imagens com sistema de recorte (Crop) circular embutido. Categorização por Jogador, Inimigo, NPC e Objeto.
- **Rolagem de Dados:** Histórico de chat e rolagem de dados embutido na barra lateral.

## Tecnologias Utilizadas

- **Frontend:** React (Vite), TailwindCSS, Lucide-React (Ícones), React-Easy-Crop.
- **Backend:** Node.js, Express, Socket.IO, Multer (para upload de arquivos locais).
- **Armazenamento:** JSON local (`data.json`) para persistência de dados simples.

## Controles e Atalhos

- **Botão Esquerdo:** Interação principal (Desenhar, Mover Tokens, Arrastar Câmera).
- **Scroll do Mouse (Rodinha):** Clicar ativa a Câmera Livre instantaneamente; Rolar ajusta o Zoom.
- **Botão Direito:** Abre menus de contexto unificados (Ajustar Zoom, Subir/Descer Camadas, Editar Tokens, Trocar Ferramentas).
- **Teclado:**
  - `Delete`
  - `Ctrl + Z`
  - `Shift + Arrasto`: Cria uma caixa de seleção (seleciona várias coisas de uma vez no mapa).

## Como Rodar o Projeto

Pre-requisitos: Ter o Node.js instalado.

### 1. Preparando o Servidor (Backend)
Na máquina que irá hospedar a mesa (ex: Raspberry Pi):
```bash
# Clone o repositório
git clone [https://github.com/SEU-USUARIO/ordem-vtt.git](https://github.com/SEU-USUARIO/ordem-vtt.git)

# Entre na pasta
cd ordem-vtt

# Instale as dependências
npm install express socket.io multer cors

# Inicie o servidor na porta 3001
node server.js
```

### 2. Preparando a Interface (FrontEnd)
No computador de desenvolvimento (Ubuntu/Windows):
```bash
# Instale as dependências da interface
npm install

# Para rodar em modo de teste:
npm run dev

# Para compilar a versão final que irá para o Servidor:
npm run build
```

Após o npm run build, copie a pasta dist gerada para dentro da pasta do servidor no Raspberry Pi. O Node.js subir essa pasta automaticamente na porta 3001