import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const canvas = read("src/features/canvas/CanvasView.tsx");
const fluxNode = read("src/features/canvas/FluxNode.tsx");
const fluxEdge = read("src/features/canvas/FluxEdge.tsx");
const domain = read("src/features/canvas/connection/domain.ts");
const machine = read("src/features/canvas/connection/machine.ts");
const registry = read("src/features/canvas/connection/portRegistry.ts");
const policy = read("src/features/canvas/connection/policy.ts");
const commands = read("src/features/canvas/connection/commands.ts");
const controller = read("src/features/canvas/connection/useCanvasConnectionController.ts");
const css = read("src/global.css");

const requirements = [
  [
    "connection editing is an explicit transaction state machine",
    /CanvasConnectionSession[\s\S]*mode: "idle"[\s\S]*mode: "creating"[\s\S]*mode: "reconnecting"[\s\S]*mode: "settling"[\s\S]*transactionId: number[\s\S]*pointerId: number/,
    domain,
  ],
  [
    "state transitions are isolated from graph mutation",
    /beginCreateConnection[\s\S]*beginReconnectConnection[\s\S]*moveConnectionSession[\s\S]*settleConnectionSession/,
    machine,
  ],
  [
    "port locking uses a strict enter radius and a larger hysteresis exit radius",
    /ENTER_RADIUS = 11[\s\S]*EXIT_RADIUS = 18[\s\S]*AMBIGUITY_DISTANCE[\s\S]*previous[\s\S]*distance\(pointer, refreshed\.screenPoint\) <= EXIT_RADIUS/,
    registry,
  ],
  [
    "the controller reads current graph callbacks through refs without rebinding during drag",
    /const optionsRef = useRef\(options\)[\s\S]*optionsRef\.current = options[\s\S]*useEffect\([\s\S]*window\.addEventListener\("pointermove"[\s\S]*\}, \[cancel, releaseAfterEvent, updateSession\]\)/,
    controller,
  ],
  [
    "a duplicate gesture retains the attempted connection and locates the committed edge",
    /attemptedConnection:\s*proposed[\s\S]*reason === "duplicate"[\s\S]*onDuplicate\(current\.candidate\.attemptedConnection\)/,
    controller,
  ],
  [
    "a gesture settles before exactly one create or reconnect command is dispatched",
    /const settling = settleConnectionSession\(current\)[\s\S]*updateSession\(settling\)[\s\S]*current\.mode === "creating"[\s\S]*currentOptions\.onCreate[\s\S]*currentOptions\.onReconnect/,
    controller,
  ],
  [
    "reconnection maps the existing edge by id and preserves edge count",
    /reconnectEdgeAtomically[\s\S]*find\(\(edge\) => edge\.id === input\.edgeId\)[\s\S]*map\(\(edge\) => edge\.id === input\.edgeId[\s\S]*nextEdges\.length !== input\.edges\.length/,
    commands,
  ],
  [
    "the graph policy ignores the moving edge while enforcing cardinality and cycles",
    /ignoredEdgeId[\s\S]*source-occupied[\s\S]*target-occupied[\s\S]*createsCycle/,
    policy,
  ],
  [
    "the selected edge passes its real committed handles into node rendering",
    /const selectedEdgeForRender[\s\S]*selectedEdgeForRender\.sourceHandle[\s\S]*selectedEdgeForRender\.targetHandle[\s\S]*selectedConnectionHandleIds/,
    canvas,
  ],
  [
    "custom ports receive pointer input while every React Flow connection entry is disabled",
    /isConnectable=\{false\}[\s\S]*isConnectableStart=\{false\}[\s\S]*isConnectableEnd=\{false\}[\s\S]*actions\?\.beginConnection/,
    fluxNode,
  ],
  [
    "React Flow cannot create or reconnect edges behind the transaction controller",
    /nodesConnectable=\{false\}[\s\S]*edgesReconnectable=\{false\}/,
    canvas,
  ],
  [
    "the same Flux edge renderer owns both committed and moving geometry",
    /data\?\.connectionDraft[\s\S]*visualSource[\s\S]*visualTarget[\s\S]*getBezierPath[\s\S]*<BaseEdge/,
    fluxEdge,
  ],
  [
    "the visible moving endpoint belongs to the edge and never intercepts input",
    /className="canvas-edge-moving-endpoint"[\s\S]*data-status=\{draft\.status\}/,
    fluxEdge,
  ],
  [
    "the actual port, rather than a duplicate endpoint, receives selected and candidate emphasis",
    /\.canvas-port-handle\.is-edge-selected[\s\S]*scale:\s*1\.4[\s\S]*\.canvas-port-handle\.is-reconnect-candidate[\s\S]*background:\s*var\(--success\)/,
    css,
  ],
  [
    "committed ports remain visibly connected before an edge is selected",
    /connectedConnectionHandleIds[\s\S]*is-connected/,
    fluxNode,
  ],
  [
    "custom ports override React Flow's pointer blocking rule",
    /\.react-flow__handle\.canvas-port-handle[\s\S]*pointer-events:\s*auto/,
    css,
  ],
  [
    "starting a connection cancels pending automatic canvas fitting",
    /onGestureStart:\s*cancelScheduledFitView/,
    canvas,
  ],
];

const forbidden = [
  [
    "the removed parallel interaction module cannot return",
    existsSync(resolve(root, "src/features/canvas/connectionInteraction.ts")),
  ],
  [
    "React Flow connection callbacks cannot return",
    /onConnect=|onReconnect=|onReconnectStart=|onReconnectEnd=|connectionLineComponent=/i.test(canvas),
  ],
  [
    "built-in handle start/end behavior cannot be left enabled",
    /isConnectableStart=\{true\}|isConnectableEnd=\{true\}/.test(fluxNode),
  ],
];

const missing = requirements
  .filter(([, pattern, source]) => !pattern.test(source))
  .map(([label]) => label);
const presentForbidden = forbidden
  .filter(([, present]) => present)
  .map(([label]) => label);

if (missing.length > 0 || presentForbidden.length > 0) {
  console.error(`Missing ${missing.length} connection architecture requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  console.error(`Found ${presentForbidden.length} forbidden connection pattern(s):`);
  for (const label of presentForbidden) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Edge transaction architecture contract passed.");
