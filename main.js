const application = require("application");
const { ImageFill, Rectangle } = require("scenegraph");
const fs = require("uxp").storage.localFileSystem;
const formats = require("uxp").storage.formats;
const base64 = require("./js/base64-arraybuffer");
const { setApiKey } = require("./js/set-api-key.js");

async function getApiKey() {
  const folder = await fs.getDataFolder();
  const entries = await folder.getEntries();

  const settingsFile = entries.find((entry) => entry.name === "settings.txt");

  let apiKey = "";
  if (settingsFile) {
    apiKey = await settingsFile.read({ format: formats.utf8 });
    return apiKey;
  } else {
    try {
      createToastMessage(`🤔 Please, set your API key first!`);
      return null;
    } catch (e) {}
  }
}

async function generateHeatmap(selection) {
  if (!selection.hasArtboards)
    return createToastMessage(`👎 Please select an Artboard`);

  const artboard = selection.items[0];

  const apiKey = await getApiKey();
  if (!apiKey) return;

  createToastMessage(`🧠 Your heatmap is generating...`);

  // Export Artboard to temporary image file
  const folder = await fs.getTemporaryFolder();
  const file = await folder.createFile("tmp", { overwrite: true });
  const renditionSettings = [
    {
      node: artboard,
      outputFile: file,
      type: application.RenditionType.JPG,
      scale: 1,
      quality: 100,
    },
  ];

  const rectangle = new Rectangle();
  createHeatmapLayer(rectangle, artboard);

  const imageFill = await application
    .createRenditions(renditionSettings)
    .then(async (results) => {
      const binary = await results[0].outputFile.read({
        format: formats.binary,
      });
      const imgBase64 = "data:image/jpg;base64," + base64.encode(binary);

      const url = await uploadImage(imgBase64, apiKey);
      const fill = await getImageFill(rectangle, url);

      return fill;
    });

  rectangle.fill = imageFill;
  createToastMessage(`🎉 Bazinga!`);
}

function createHeatmapLayer(rectangle, artboard) {
  rectangle.name = "VisualEyes Heatmap";
  rectangle.width = artboard.width;
  rectangle.height = artboard.height;
  artboard.addChild(rectangle);
  rectangle.moveInParentCoordinates(0, 0);
}

function uploadImage(image, apiKey) {
  const formData = new FormData();
  formData.append("isTransparent", "true");
  formData.append("platform", "adobexd");
  formData.append("image", image);

  return new Promise(function(resolve, reject) {
    fetch("https://api.visualeyes.loceye.io/predict/", {
      method: "POST",
      body: formData,
      headers: {
        Authorization: `Token ${apiKey}`,
        // "Content-Type": "application/x-www-form-urlencoded",
        "cache-control": "no-cache",
      },
    })
      .then((res) => {
        const { status } = res;

        if (status === 200) {
          console.log("Successful");
        } else if (status === 401) {
          createToastMessage(`🙄 Your API key is not valid`);
        } else if (status === 403) {
          createToastMessage(`🚨 Your heatmaps limit has been exceeded`);
        } else {
          createToastMessage(
            `😱 We are deeply sorry, but something went terrible wrong!`
          );
        }
        return res.json();
      })
      .then((json) => {
        if (json.code !== "success") {
          throw new Error("Error during fetching the heatmap");
        }
        const heatmapURL = json.url;
        resolve(heatmapURL);
        // createToastMessage(`🎉 Bazinga!`);
      })
      .catch((err) => {
        reject(err);
      });
  });
}

function xhrBinary(url) {
  return new Promise((resolve, reject) => {
    const req = new XMLHttpRequest();
    req.onload = () => {
      if (req.status === 200) {
        try {
          const arr = new Uint8Array(req.response);
          resolve(arr);
        } catch (err) {
          reject(`Couldnt parse response. ${err.message}, ${req.response}`);
        }
      } else {
        reject(`Request had an error: ${req.status}`);
      }
    };
    req.onerror = reject;
    req.onabort = reject;
    req.open("GET", url, true);
    req.responseType = "arraybuffer";
    req.send();
  });
}

async function getImageFill(rectangle, url) {
  try {
    const photoObj = await xhrBinary(url);
    const tempFolder = await fs.getTemporaryFolder();
    const file = await tempFolder.createFile("tmp", { overwrite: true });
    await file.write(photoObj, { format: formats.binary });
    const imageFill = new ImageFill(file);
    return imageFill;
  } catch (err) {
    console.log(err.message);
  }
}

function createToastMessage(message) {
  document.body.innerHTML = `
    <dialog id="dialog">
      <form>
        <p>${message}</p>
        <footer>
          <button id="button" type="submit" uxp-variant="primary">Close</button>
        </footer>
      </form>
    </dialog>
  `;
  const dialog = document.querySelector("#dialog");
  dialog.addEventListener("submit", () => dialog.remove());

  setTimeout(() => dialog.remove(), 5000);
  dialog.showModal();
}

module.exports = {
  commands: {
    generateHeatmap,
    setApiKey,
  },
};
