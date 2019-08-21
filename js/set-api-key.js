const fs = require("uxp").storage.localFileSystem;
const { formats } = require("uxp").storage;

const FILENAME = "settings.txt";

let previousKey = "";

async function setApiKey() {
  const folder = await fs.getDataFolder();
  const entries = await folder.getEntries();

  const hasSettings = entries.some((entry) => entry.name === FILENAME);

  let settingsFile;
  if (hasSettings) {
    // File settings.txt exists already
    settingsFile = entries.find((entry) => entry.name === FILENAME);
    previousKey = await settingsFile.read({ format: formats.utf8 });
    console.log("Found previousKey: " + previousKey);
  } else {
    // Create settings.txt file
    console.log("Not Found previousKey: " + previousKey);

    settingsFile = await folder.createFile(FILENAME, {
      overwrite: true,
    });
  }

  create(settingsFile);
}

function create(settingsFile) {
  document.body.innerHTML = `
    <style>
        .description {
          margin-bottom: 1.5rem;
          width: 300px;
        }
        .description > h1 {
          margin-bottom: 1rem;
        }
        .description > h1,
        .description > p {
          width: 300px;
        }
        .anchor{
          display: inline
        }
        .break {
            flex-wrap: wrap;
        }
        label.row > span {
            color: #8E8E8E;
            width: 40px;
            text-align: right;
            font-size: 9px;
        }
        label.row input {
            flex: 1 1 auto;
        }
        .show {
            display: block;
        }
        .hide {
            display: none;
        }
    </style>    
    <dialog id="dialog">
      <form method="dialog" id="main">
        <div class="description">
          <h1>Set your API key</h1>
          <p>Find your API key on our <a href="https://visualeyes.loceye.io/subscribe.html?tool=adobeXD" class="anchor">website</a></p>
        </div>
        <div class="row break">
          <label class="row">
            <span>API key:</span>
            <input type="text" uxp-quiet="true" id="input" value="${previousKey}" placeholder="Type in your API key" />
          </label>
        </div>
        <footer>
          <button id="cancel">Cancel</button>
          <button id="set" type="submit" uxp-variant="cta">Set key</button>
        </footer>
      </form>
    </dialog>

  `;

  async function writeApiKey(dialog) {
    const apiKey = document.querySelector("#input").value;
    await settingsFile.write(apiKey);

    dialog.remove();
    createToastMessage("🎉 Your API key is set " + apiKey);
    // resolve(apiKey);
  }

  const dialog = document.querySelector("#dialog");
  document.querySelector("#set").addEventListener("click", writeApiKey);
  document.querySelector("#main").addEventListener("submit", writeApiKey);
  document
    .querySelector("#cancel")
    .addEventListener("click", () => dialog.close("reasonCanceled"));
  dialog.showModal();
}

function createToastMessage(message) {
  document.body.innerHTML = `
    <dialog id="toast">
      <form>
        <p>${message}</p>
        <footer>
          <button id="button" type="submit" uxp-variant="primary">Close</button>
        </footer>
      </form>
    </dialog>
  `;

  const dialog = document.querySelector("#toast");
  dialog.addEventListener("submit", () => dialog.remove());

  setTimeout(() => dialog.remove(), 5000);
  dialog.showModal();
}

module.exports = {
  setApiKey,
};
