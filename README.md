# Câmera Circular

Câmera flutuante para gravar tutoriais no Mac, em círculo, quadrado ou retângulo, com borda opcional. Fica sempre acima das outras janelas (inclusive apps em tela cheia), então qualquer gravador de tela captura você junto: `⌘⇧5`, QuickTime ou OBS.

## Como rodar

Precisa do [Node.js](https://nodejs.org) 18 ou mais novo.

```bash
cd camera-circular
npm install
npm start
```

Na primeira execução o macOS pede permissão de câmera. Se você negou sem querer, libere em **Ajustes do Sistema › Privacidade e Segurança › Câmera**.

## Gerar o app instalável (.dmg)

```bash
npm run dist
```

O instalador sai em `dist/Camera Circular-<versão>-arm64.dmg` (Mac com Apple Silicon). Abra o `.dmg` e arraste o app para **Aplicativos**. Na primeira execução o macOS pede a permissão de câmera para o app.

- O `electron-builder` assina com o certificado "Apple Development" que estiver no chaveiro. Ele serve para uso neste Mac; para distribuir a outras pessoas é preciso um certificado "Developer ID" e notarização.
- A permissão de câmera do app assinado vem de `build/entitlements.mac.plist`. Sem a linha `device.camera` o macOS bloqueia a câmera em silêncio.
- O `productName` precisa ficar **sem acento**: com "Câmera Circular" o app empacotado fecha sozinho ao abrir (Electron 45).
- Para Mac Intel, troque `arch` em `build.mac.target` do `package.json` por `x64` (ou `universal`).
- O ícone é gerado de `build/icon.svg`; o PNG usado no build é `build/icon.png` (1024×1024, fundo transparente).

## Como usar

| Ação | Como fazer |
|---|---|
| Mover | Arraste a câmera |
| Redimensionar | Arraste o ícone de setas que aparece no canto inferior direito ao passar o mouse |
| Fechar o app | Clique no **X** que aparece no canto superior direito ao passar o mouse |
| Redimensionar | Scroll do mouse ou pinça no trackpad sobre a câmera |
| Tamanho padrão | Duplo clique na câmera |
| Forma, borda, tamanhos prontos, espelhar, trocar de câmera, ocultar, sair | Botão de ajustes (⚙) no canto superior esquerdo da câmera, clique direito nela, ou o ícone 📷 na barra de menus (o menu é o mesmo) |
| Espessura e cor da borda | Menu › **Aparência…** |

- Formas: círculo, quadrado e retângulo 16:9. A borda pode ser ligada ou desligada; a espessura vai de 1 a 16 px e a cor é livre (há 9 cores prontas).
- O tamanho vai de 120 a 800 px de largura; no retângulo a altura segue a proporção 16:9.
- Ao ocultar pelo menu, a câmera é desligada (a luz apaga). Ao mostrar, volta a ligar.
- Posição, tamanho, forma, borda, espelhamento e câmera escolhida ficam salvos entre as execuções.
- O sentido do scroll segue a configuração de rolagem do seu Mac. Se ficar invertido, inverta o sinal em `renderer/renderer.js` (linha do `pendingDelta`).

## Estrutura

```
main.js               janelas, ícone da barra de menus, forma/borda, arrastar/redimensionar
preload.js            ponte mínima e segura entre a câmera e o main
preload-settings.js   idem, para a janela Aparência
renderer/index.html   estrutura da câmera
renderer/styles.css   forma, borda e alça de redimensionar
renderer/renderer.js  câmera (getUserMedia), scroll, eventos de arrastar
renderer/settings.*   janela Aparência (forma, borda, espessura, cor)
```

## Observações

- Feito para macOS. O código roda em outros sistemas, mas só foi pensado para o Mac.
- Rodando com `npm start`, o macOS associa a permissão de câmera ao Electron. Já o app instalado (`.dmg`) tem a permissão própria.
- Se a câmera aparecer preta ao iniciar o app de dentro de outro app (editor, assistente de código), é porque o macOS atribui a permissão de câmera a quem iniciou o processo. Inicie fora dele, num terminal normal, ou com `open -n node_modules/electron/dist/Electron.app --args "$PWD"`.
