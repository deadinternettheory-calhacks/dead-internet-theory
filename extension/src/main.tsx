import { createRoot } from 'react-dom/client';
import { App } from './App';
import '@fontsource-variable/inter';
import '../../web/src/styles.css';
import './panel.css';

createRoot(document.getElementById('root')!).render(<App/>);
