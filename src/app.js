import React, { Component } from "react";
import { render } from "react-dom";
import DeckGL, {
  LightingEffect,
  AmbientLight,
  DirectionalLight,
  OrbitView,
} from "deck.gl";
import MinecraftLayer from "./minecraft-layer";
import Minimap from "./components/minimap";
import SummaryPanel from "./components/summary-panel";
import About from "./components/about";

import {
  loadMCA,
  readChunks,
  REGION_FILE_PATTERN,
  addChunkkent,
  getBlockTemperature,
  getBlockHumidity,
  isBlockOpaque,
} from "./utils/mca-parser";

const sampleFile = "r.0.0.mca";

const INITIAL_VIEW_STATE = {
  target: [0, 0, 0],
  zoom: 0,
  orbitAxis: "Y",
  rotationX: 30,
  rotationOrbit: 30,
  minZoom: -3,
  maxZoom: 10,
};

const LIGHTING_EFFECT = new LightingEffect({
  ambient: new AmbientLight({
    color: [255, 255, 255],
    intensity: 0.6,
  }),
  dir1: new DirectionalLight({
    color: [255, 255, 255],
    intensity: 1.0,
    direction: [-3, -6, -1],
  }),
  dir2: new DirectionalLight({
    color: [255, 255, 255],
    intensity: 0.5,
    direction: [3, -1, -0],
  }),
});

function foundthemin(liste) {
  return Math.min.apply(null, liste);
}

function foundthemax(liste) {
  return Math.max.apply(null, liste);
}

class Root extends Component {
  constructor(props) {
    super(props);
    this.state = {
      viewState: INITIAL_VIEW_STATE,
      sliceY: 1,
      regionInfo: null,
      selection: {
        chunks: [],
        data: null,
      },
      hoveredBlock: null,
    };

    this.startWebSocket();

    // load example region file
    fetch(`./samples/${sampleFile}`)
      .then((resp) => resp.arrayBuffer())
      .then((data) => this._onDataLoaded(sampleFile, data));
  }

  startWebSocket() {
    const ws = new WebSocket("ws://127.0.0.1:8069");

    let chunkloaded = [];
    let boundsactual = [[], [], [], [], [], []];
    let countBlockactual = 0;
    let dataactual = [];

    let selectionlist = [];

    ws.onopen = (event) => {
      console.log("Sending chunk request to server");
      ws.send(
        JSON.stringify({
          event: "chunk",
          datainput: {
            chunkx: 45, // Make the viewer choice the chunks?
            chunkz: 4541, // chunkx/chunkz are not used.
          },
        })
      );
    };

    ws.onmessage = (event) => {
      

      const msginput = JSON.parse(event.data);

      const { dataoutput } = msginput;

      const { endmessage } = dataoutput;

      if (endmessage != null) {
        

        this.setState({
          selection: selectionlist[0],
          viewState: selectionlist[1],
        });
      }

      const { bounds } = dataoutput;
      const { chunks } = dataoutput;
      const { blockCount } = dataoutput;

      const { data } = dataoutput;

      if (
        !chunkloaded.some(
          (arr) => JSON.stringify(arr) === JSON.stringify(chunks[0])
        )
      ) {
        // Check if this chunk is already loaded
        chunkloaded = chunkloaded.concat(chunks);

        // Push bounds

        boundsactual[0].push(bounds.maxX);
        boundsactual[1].push(bounds.maxY);
        boundsactual[2].push(bounds.maxZ);
        boundsactual[3].push(bounds.minX);
        boundsactual[4].push(bounds.minY);
        boundsactual[5].push(bounds.minZ);

        // BlockCount

        countBlockactual += blockCount;

        // Data

        dataactual = dataactual.concat(data);
      }

      const maxXk = foundthemax(boundsactual[0]);
      const maxYk = foundthemax(boundsactual[1]);
      const maxZk = foundthemax(boundsactual[2]);
      const minXk = foundthemin(boundsactual[3]);
      const minYk = foundthemin(boundsactual[4]);
      const minZk = foundthemin(boundsactual[5]);

      const finalstate = {
        blockCount: countBlockactual,
        bounds: {
          maxX: maxXk,
          maxY: maxYk,
          maxZ: maxZk,
          minX: minXk,
          minY: minYk,
          minZ: minZk,
        },
        chunks: chunkloaded,
        data: dataactual,
      };

      const scale =
        Math.min(window.innerWidth, window.innerHeight) /
        Math.max(maxXk - minXk, maxYk - minYk, maxZk - minZk);

      const viewState = {
        ...INITIAL_VIEW_STATE,
        target: [(minXk + maxXk) / 2, (minYk + maxYk) / 2, (minZk + maxZk) / 2],
        zoom: Math.log2(scale),
      };

      addChunkkent(finalstate);

      // this.setState({selection:finalstate, viewState});
      selectionlist = [finalstate, viewState];

      console.log("New Chunks Loaded... Wait Until It End");
    };
  }

  // Other methods remain unchanged

  _onDataLoaded = (filename, data) => {
    const result = loadMCA(filename, data);

    if (result.error) {
      alert(`Error loading file: ${result.error}`);
      this.setState({
        regionInfo: null,
        selection: {
          chunks: [],
          data: null,
        },
      });
    } else {
      this.setState({ regionInfo: result });
      
      // console.log(result);

      // const {availableChunks} = result;
      // const randomIndex = Math.floor(Math.random() * availableChunks.length);

      // this._readChunks(result.availableChunks.slice(288, 288 + 1));
    }
  };

  _readChunks = (chunks) => {
    const selection = readChunks(chunks);
    const { bounds } = selection;

    const scale =
      Math.min(window.innerWidth, window.innerHeight) /
      Math.max(
        bounds.maxX - bounds.minX,
        bounds.maxY - bounds.minY,
        bounds.maxZ - bounds.minZ
      );

    const viewState = {
      ...INITIAL_VIEW_STATE,
      target: [
        (bounds.minX + bounds.maxX) / 2,
        (bounds.minY + bounds.maxY) / 2,
        (bounds.minZ + bounds.maxZ) / 2,
      ],
      zoom: Math.log2(scale),
    };

    // this.setState({selection, viewState});

    console.log(this.state);
  };

  _onSliceY = (e) => {
    this.setState({
      sliceY: e.target.value,
    });
  };

  _handleFileDrop = (evt) => {
    evt.preventDefault();

    const files = evt.dataTransfer.files;

    if (files.length) {
      const file = files[0];

      if (REGION_FILE_PATTERN.test(file.name)) {
        // is valid
        const fileReader = new FileReader();

        fileReader.onerror = (err) => {
          alert(`Reading ${file.name} Error: ${err}`);
        };
        fileReader.onload = ({ target: { result } }) => {
          this._onDataLoaded(file.name, result);
        };
        fileReader.readAsArrayBuffer(file);
      } else {
        alert(`Cannot read ${file.name}. Please use an mca file.`);
      }
    }
  };

  _onHoverBlock = ({ object }) => {
    this.setState({ hoveredBlock: object });
  };

  _preventDefault(evt) {
    evt.preventDefault();
  }

  _onViewStateChange = ({ viewState }) => {
    this.setState({ viewState });
  };

  _onWebGLInitialized(gl) {
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
  }

  render() {
    const { viewState, sliceY, selection, regionInfo, hoveredBlock } =
      this.state;
    const { infoPanel } = this.refs;

    const layers = [
      selection.data &&
        new MinecraftLayer({
          id: "minecraft-layer",
          getTemperature: getBlockTemperature,
          getBlockHumidity: getBlockHumidity,
          getIsBlockOpaque: isBlockOpaque,
          data: selection.data,
          sliceY: Math.floor(
            sliceY * selection.bounds.maxY +
              (1 - sliceY) * selection.bounds.minY
          ),
          pickable: true,
          autoHighlight: true,
          highlightColor: [255, 255, 0, 128],
          onHover: this._onHoverBlock,
        }),
    ].filter(Boolean);

    // console.log(layers);

    return (
      <div onDragOver={this._preventDefault} onDrop={this._handleFileDrop}>
        <DeckGL
          views={new OrbitView()}
          viewState={viewState}
          controller={true}
          effects={[LIGHTING_EFFECT]}
          onViewStateChange={this._onViewStateChange}
          onWebGLInitialized={this._onWebGLInitialized}
          layers={layers}
        />

        <About />

        <input
          type="range"
          className="y-slicer"
          min={0.01}
          max={1}
          step={0.01}
          value={sliceY}
          onChange={this._onSliceY}
        />

        <Minimap
          data={regionInfo}
          selection={selection.chunks}
          direction={viewState.rotationOrbit}
          onSelect={this._readChunks}
        />

        <SummaryPanel data={selection} hoveredBlock={hoveredBlock} />
      </div>
    );
  }
}

/* global document */
const root = document.createElement("div");
document.body.appendChild(root);
render(<Root />, root);
