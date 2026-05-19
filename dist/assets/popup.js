import{c as s,j as e}from"./styles.js";import{c as o,S as r}from"./settings.js";/**
 * @license lucide-react v0.468.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const a=o("PanelRightOpen",[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2",key:"afitv7"}],["path",{d:"M15 3v18",key:"14nvp0"}],["path",{d:"m10 15-3-3 3-3",key:"1pgupc"}]]);function c(){async function t(){const[n]=await chrome.tabs.query({active:!0,currentWindow:!0});n!=null&&n.id&&await chrome.sidePanel.open({tabId:n.id}),window.close()}function i(){chrome.runtime.openOptionsPage()}return e.jsxs("main",{className:"popup",children:[e.jsxs("div",{className:"brand",children:[e.jsx("strong",{children:"ClipLayer"}),e.jsx("span",{children:"ログイン後ページからデータを取り込みます"})]}),e.jsxs("button",{className:"primary",onClick:t,children:[e.jsx(a,{size:16})," Side Panel"]}),e.jsxs("button",{onClick:i,children:[e.jsx(r,{size:16})," 設定"]})]})}s.createRoot(document.getElementById("root")).render(e.jsx(c,{}));
