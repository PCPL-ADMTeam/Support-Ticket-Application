import ReactDOM from "react-dom/client";
import App from "./App";

// Intentionally not wrapped in <React.StrictMode> — react-quill (used for
// the rich-text ticket description) relies on findDOMNode, which
// StrictMode's double-invoke behavior logs noisy warnings for in dev.
ReactDOM.createRoot(document.getElementById("root")).render(<App />);
