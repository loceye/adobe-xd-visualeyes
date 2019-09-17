const application = require("application");
const commands = require("commands");

const {
  ImageFill,
  Rectangle,
  Color,
  LinearGradientFill,
  Text,
} = require("scenegraph");
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

async function getAOI(selection) {
  if (!selection.hasArtboards)
    return createToastMessage(`👎 Please select an Artboard`);

  const artboard = selection.items[0];
  const layers = artboard.children;

  const rectangles = layers
    .filter((layer) => {
      const isRectangle = layer instanceof Rectangle && layer.name === "AOI";

      if (isRectangle) {
        const { x, y, width, height } = layer.boundsInParent;
        const maxWidth = artboard.width;
        const maxHeight = artboard.height;

        const isInsideArtboard =
          x >= 0 && y >= 0 && x + width <= maxWidth && y + height <= maxHeight;

        const isSmall = width < 70 || height < 32;

        if (isSmall) {
          createToastMessage(
            " 👎 One of your rectangles was not big enough (minimum 70x32 pixels)"
          );
          layer.visible = false;
          layer.name = "🚨 Too small (minimum 70x32)";
        } else if (!isInsideArtboard) {
          createToastMessage(
            " 😱 One of your rectangles is outside the current Artboard."
          );
          layer.visible = false;
          layer.name = "🚨 Off the current Artboard";
        }

        return isInsideArtboard && !isSmall;
      } else {
        return false;
      }
    })
    .map((rect, index) => {
      // Get the bounding box
      const { x, y, width, height } = rect.boundsInParent;

      // Extract dominant color
      const BRANDING_COLOR = "#3E21DE";
      const fill = rect.fill;
      const hasFill = !(fill === null || !rect.fillEnabled);

      let color = BRANDING_COLOR;
      if (hasFill) {
        const isColor = fill instanceof Color;
        // const isGradient = fill instanceof LinearGradientFill;
        const isGradient = false;

        if (isColor) {
          color = fill.toHex() || BRANDING_COLOR;
        } else if (isGradient) {
          color = fill.colorStops[0].toHex() || BRANDING_COLOR;
        }
      }

      // Remove the rect in order to extract the plain image
      rect.removeFromParent();

      return {
        id: rect.guid,
        color,
        x,
        y,
        width,
        height,
      };
    });

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

      const { heatmapURL, areas } = await uploadImage(
        imgBase64,
        apiKey,
        rectangles
      );
      const fill = await getImageFill(rectangle, heatmapURL);

      rectangles.forEach((rect) => {
        rect.score = areas.find((area) => area.id === rect.id).score;
      });

      return fill;
    });

  rectangle.fill = imageFill;

  drawAOI(rectangles, selection);

  createToastMessage(`🎉 Bazinga!`);
}

async function drawAOI(rectangles, selection) {
  rectangles.map((rect, index) => {
    const { x, y, width, height, color, score } = rect;

    const backgroundRectangle = new Rectangle();
    backgroundRectangle.width = width;
    backgroundRectangle.height = height;
    backgroundRectangle.fill = new Color(color, 0.2);
    backgroundRectangle.stroke = new Color(color);
    backgroundRectangle.strokeWidth = 4;
    backgroundRectangle.name = "Background";

    const scoreRectangle = new Rectangle();
    scoreRectangle.width = 70;
    scoreRectangle.height = 32;
    scoreRectangle.fill = new Color(color);
    scoreRectangle.name = "Score Background";

    const scoreText = new Text();
    scoreText.text = `${score}%`;
    scoreText.fill = new Color("#fff");
    scoreText.fontSize = 18;
    scoreText.fontStyle = "bold";

    selection.insertionParent.addChild(backgroundRectangle);
    selection.insertionParent.addChild(scoreRectangle);
    selection.insertionParent.addChild(scoreText);

    backgroundRectangle.moveInParentCoordinates(x, y);
    scoreRectangle.moveInParentCoordinates(x, y);
    scoreText.moveInParentCoordinates(x + 12, y + 22);

    selection.items = [backgroundRectangle, scoreRectangle, scoreText];
    commands.group();
    const group = selection.items[0];
    group.name = `AOI ${index + 1}`;
    group.locked = true;

    selection.items = [];

    return;
  });
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

      const { heatmapURL } = await uploadImage(imgBase64, apiKey, []);
      const fill = await getImageFill(rectangle, heatmapURL);

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
  rectangle.locked = true;
}

function uploadImage(image, apiKey, rectangles) {
  const hasAOI = rectangles.length > 0;

  const formData = new FormData();
  formData.append("isTransparent", "true");
  formData.append("platform", "adobexd");
  formData.append("image", image);
  if (hasAOI) {
    const aoi = rectangles.map((rect) => {
      const { x, y, width, height, id } = rect;
      return {
        id,
        points: [
          { x: x, y: y, index: 0 },
          { x: x + width, y: y, index: 1 },
          {
            x: x + width,
            y: y + height,
            index: 2,
          },
          { x: x, y: y + height, index: 3 },
        ],
      };
    });

    formData.append("aoi", JSON.stringify(aoi));
  }

  return new Promise(function(resolve, reject) {
    fetch("https://www.visualeyes.design/predict/", {
      method: "POST",
      body: formData,
      headers: {
        Authorization: `Token ${apiKey}`,
        "cache-control": "no-cache",
      },
    })
      .then((res) => {
        const { status } = res;

        if (status === 200) {
          console.log("Successful");
        } else if (status === 401) {
          createToastMessage(`🙄 Your API key is not valid`);
        } else if (status === 402) {
          createToastMessage(
            "🛫 In order to access this feature you need to upgrade your account. Visit https://www.visualeyes.design for more information."
          );
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
        const areas = json.aoi;
        resolve({
          heatmapURL,
          areas,
        });
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
    getAOI,
  },
};
