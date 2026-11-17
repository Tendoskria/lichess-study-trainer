import '@fontsource/noto-sans/latin-400.css';
import '@fontsource/noto-sans/latin-700.css';
import './styles/main.css';
import { SettingsStore } from './services/storage';
import { App } from './ui/app';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app container');

new App(root, { settings: new SettingsStore() }).start();
