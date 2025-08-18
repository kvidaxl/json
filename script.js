// --- APP ENTRY POINT ---
document.addEventListener('DOMContentLoaded', () => {
    try {
        const app = new AppManager(APP_CONFIG);
    } catch (error) {
        console.error('Fatal Error Initializing Application:', error);
        document.body.innerHTML = '<h2>Application Error</h2><p>Could not load the application. Please check the console and refresh.</p>';
    }
});

// --- CONFIGURATION ---
const APP_CONFIG = {
    STORAGE_KEY_DRAFT: 'promptSuiteDraft',
    STORAGE_KEY_THEME: 'promptSuiteTheme',
    DEFAULT_VALUES: {
        product_description: "Single bed + double bed (with headboard)",
        preservation: "Absolutely do not alter the bed in any way.\nIts geometry, structure, length-to-width ratio, height, leg spacing, headboard design, material surface texture, wood grain or fabric pattern, and original color must remain 100% unchanged.\nNo smoothing, stylizing, color shifting, retexturing, or proportion editing is allowed.",
        color: "the overall room decor should adapt to the bed's color, ensuring everything complements the original design without altering the bed",
        setting: "ultra-bright and airy bedroom with pure white walls and pale wood flooring",
        scene_elements: "- Two matching minimalist bedside tables (white or neutral tone), symmetrically placed beside the bed\n- One large rectangular neutral-tone rug (cream, beige, or light gray), centered precisely under the bed and extending beyond its edges\n- Two abstract framed artworks centered directly above the headboard, in soft neutral colors\n- Sheer white or beige curtains, softly lit\n- (Optional) One tall indoor potted plant in the back corner, in a white or stone-colored ceramic pot",
        remove: "decorative throw pillows, footstools, window sill plants, bright-colored accents",
        lighting: "extremely bright natural daylight filling the room — soft yet intense, with well-defined soft shadows and high overall ambient brightness",
        prompt_template: "Generate a realistic <style> -style bedroom interior scene featuring the exact same product: a <product_description> as in the reference image, placed against the wall as hero product.\n\n<preservation>\n\nStyle: <style>\n\nColor harmony: <color>\nSetting: <setting>\n\nScene Elements: <scene_elements>\n\nRemove: <remove>\nLighting: <lighting>\n\nCamera view: <camera_view>",
        style: "Modern", category: "Beds", camera_view: "front-centered perspective, highlighting the overall bed design and symmetry"
    },
    SELECT_OPTIONS: {
        style: ["Modern", "Scandinavian", "Modern Nordic", "Scandinavian Minimalist", "Light Industrial", "American Farmhouse"],
        category: ["Beds", "Chairs", "Tables", "Sofas", "Storage"],
        camera_view: [ "front-centered perspective, highlighting the overall bed design and symmetry", "front view from above", "slightly front-left perspective", "30-degree front-left perspective", "45-degree front-left perspective", "slightly front-right perspective", "30-degree front-right perspective", "45-degree front-right perspective", "direct left-side perspective, showing full side structure", "direct right-side perspective, showing full side structure", "slightly rear view", "top-down view" ]
    }
};

// --- CLASS 1: THE BRAIN (State and Business Logic) ---
class AppManager {
    #config; #state; #ui; #isDirty = false;
    constructor(config) {
        this.#config = config;
        this.#state = { formData: this.#loadDraft(), cleanJSON: '', cleanText: '' };
        this.#ui = new UIManager(this);
        this.generateOutput();
        window.addEventListener('beforeunload', (e) => {
            if (this.#isDirty) {
                e.preventDefault();
                e.returnValue = '';
            }
        });
    }
    getState() { return this.#state; }
    updateFormField(field, value) {
        if (this.#state.formData[field] !== value) {
            this.#state.formData[field] = value;
            this.generateOutput();
            this.#saveDraft();
            this.#isDirty = true;
        }
    }
    resetForm() {
        this.#state.formData = { ...this.#config.DEFAULT_VALUES };
        this.generateOutput();
        this.#ui.populateForm(this.#state.formData);
        localStorage.removeItem(this.#config.STORAGE_KEY_DRAFT);
        this.#isDirty = false;
        this.#ui.showToast('Form has been reset to defaults.', 'success');
    }
    importJson(jsonText) {
        try {
            const data = JSON.parse(jsonText);
            const params = data.prompt_parameters || data;
            Object.keys(this.#state.formData).forEach(key => {
                if (key in params && typeof params[key] === 'string') {
                    this.#state.formData[key] = params[key];
                }
            });
            if ('prompt_template' in params && typeof params.prompt_template === 'string') {
                this.#state.formData.prompt_template = params.prompt_template;
            }
            this.generateOutput();
            this.#ui.populateForm(this.#state.formData);
            this.#isDirty = true;
            this.#ui.showToast('JSON imported successfully.', 'success');
        } catch (e) {
            this.#ui.showToast('Invalid JSON format.', 'error');
        }
    }
    
    // [REMOVED] reverseEngineer method is gone

    generateOutput() {
        const v = this.#state.formData;
        const jsonData = { _id: { $oid: this.#generateBsonObjectId() }, name: v.product_description || "Untitled", category: v.category || "General", ai_type: "flux", prompt_parameters: { ...v }, prompt_template: v.prompt_template || "", createdAt: { $date: new Date().toISOString() }, updatedAt: { $date: new Date().toISOString() }, _class: "com.vidaxl.platformai.image.generation.domain.ImageGenerationPrompt" };
        this.#state.cleanJSON = JSON.stringify(jsonData, null, 2);
        let cleanText = v.prompt_template || '';
        Object.keys(v).forEach(key => {
            cleanText = cleanText.replace(new RegExp(`<${key}>`, 'g'), v[key] || '');
        });
        this.#state.cleanText = cleanText;
        this.#ui.updateOutputs(this.#state.cleanJSON, this.#state.cleanText, v.prompt_template);
    }
    #loadDraft() { try { const s = localStorage.getItem(this.#config.STORAGE_KEY_DRAFT); return s ? { ...this.#config.DEFAULT_VALUES, ...JSON.parse(s) } : { ...this.#config.DEFAULT_VALUES }; } catch { return { ...this.#config.DEFAULT_VALUES }; } }
    #saveDraft() { localStorage.setItem(this.#config.STORAGE_KEY_DRAFT, JSON.stringify(this.#state.formData)); this.#isDirty = false; }
    #generateBsonObjectId() { const t = Math.floor(Date.now() / 1000).toString(16); const r = Math.random().toString(16).slice(2); return t.padStart(8, '0') + r.slice(0, 16).padStart(16, '0'); }
}

// --- CLASS 2: THE HANDS (DOM Manipulation and Event Handling) ---
class UIManager {
    #app; #dom = {}; #debouncedUpdate;
    constructor(appManager) {
        this.#app = appManager;
        this.#cacheDom();
        this.#addIcons();
        this.#loadTheme();
        this.#populateSelects();
        this.#setupEventListeners();
        this.populateForm(this.#app.getState().formData);
        this.#setOutputViewMode('json');
    }
    
    populateForm(formData) { Object.keys(formData).forEach(id => { if (this.#dom.inputs[id]) this.#dom.inputs[id].value = formData[id] || ''; }); this.#updateLineNumbers(); }
    
    updateOutputs(json, text, template) {
        try {
            this.#dom.outputs.json.innerHTML = this.#highlightJson(json);
            
            let highlightedText = this.#escapeHtml(template || '');
            const formData = this.#app.getState().formData;
            Object.keys(formData).forEach(key => {
                const value = formData[key] || '';
                const safeValue = this.#escapeHtml(value);
                highlightedText = highlightedText.replace(new RegExp(`<${key}>`, 'g'), `<span class="var-${key}">${safeValue}</span>`);
            });
            this.#dom.outputs.text.innerHTML = highlightedText.replace(/\n/g, '<br>');

        } catch (error) {
            console.error("Failed to update outputs:", error);
            this.#dom.outputs.json.textContent = "Error rendering JSON.";
            this.#dom.outputs.text.textContent = "Error rendering text preview.";
        }
    }

    showToast(message, type = 'success', duration = 3000) { const t = document.createElement('div'); t.className = `toast ${type}`; t.textContent = message; this.#dom.toastContainer.appendChild(t); setTimeout(() => t.remove(), duration); }
    showConfirmation(title, message, onConfirm) {
        this.#dom.modal.title.textContent = title;
        this.#dom.modal.message.textContent = message;
        this.#dom.modal.el.hidden = false;
        const confirmHandler = () => { onConfirm(); cleanup(); };
        const cancelHandler = () => cleanup();
        const cleanup = () => { this.#dom.modal.el.hidden = true; this.#dom.modal.confirmBtn.removeEventListener('click', confirmHandler); this.#dom.modal.cancelBtn.removeEventListener('click', cancelHandler); };
        this.#dom.modal.confirmBtn.addEventListener('click', confirmHandler, { once: true });
        this.#dom.modal.cancelBtn.addEventListener('click', cancelHandler, { once: true });
    }

    #cacheDom() {
        this.#dom.body = document.body;
        const formFields = [...Object.keys(APP_CONFIG.DEFAULT_VALUES)];
        this.#dom.inputs = {};
        formFields.forEach(id => this.#dom.inputs[id] = document.getElementById(id));
        this.#dom.inputs.json_import = document.getElementById('json_import');
        this.#dom.formInputs = Object.values(this.#dom.inputs).filter(Boolean);
        this.#dom.outputPane = document.getElementById('output-pane');
        this.#dom.outputNav = { container: document.querySelector('.output-view-control'), buttons: { json: document.getElementById('btn-view-json'), text: document.getElementById('btn-view-text') } };
        this.#dom.outputs = { json: document.getElementById('json-output'), text: document.getElementById('text-output') };
        this.#dom.modal = { el: document.getElementById('confirmation-modal'), title: document.getElementById('modal-title'), message: document.getElementById('modal-message'), confirmBtn: document.getElementById('modal-btn-confirm'), cancelBtn: document.getElementById('modal-btn-cancel') };
        this.#dom.toastContainer = document.getElementById('toast-container');
        this.#dom.template = { textarea: document.getElementById('prompt_template'), lineNumbers: document.getElementById('template-line-numbers') };
        this.#dom.buttons = {
            copyJson: document.getElementById('btn-copy-json'), copyText: document.getElementById('btn-copy-text'),
            downloadJson: document.getElementById('btn-download-json'), downloadTxt: document.getElementById('btn-download-text'),
            reset: document.getElementById('btn-reset-form'),
            upload: document.getElementById('btn-upload-json'),
            importJson: document.getElementById('btn-import-json'), clearImport: document.getElementById('btn-clear-import'),
            fileInput: document.getElementById('json-file-input'),
            themeToggle: document.getElementById('theme-toggle'),
        };
    }
    #addIcons() {
        this.#dom.buttons.copyJson.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
        this.#dom.buttons.copyText.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
        this.#dom.buttons.downloadJson.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`;
        this.#dom.buttons.downloadTxt.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`;
    }
    #setupEventListeners() {
        this.#debouncedUpdate = this.#debounce((field, value) => this.#app.updateFormField(field, value), 250);
        this.#dom.formInputs.forEach(input => { if (input) input.addEventListener('input', e => this.#debouncedUpdate(e.target.id, e.target.value)); });
        this.#dom.template.textarea.addEventListener('input', () => this.#updateLineNumbers());
        this.#dom.template.textarea.addEventListener('scroll', () => this.#syncScroll(), { passive: true });
        this.#dom.buttons.reset.addEventListener('click', () => { this.showConfirmation('Reset Form?', 'All current values will be lost and reset to defaults.', () => this.#app.resetForm()); });
        this.#dom.buttons.importJson.addEventListener('click', () => this.#app.importJson(this.#dom.inputs.json_import.value));
        this.#dom.buttons.clearImport.addEventListener('click', () => { this.#dom.inputs.json_import.value = ''; this.showToast('Import area cleared.', 'success'); });
        this.#dom.buttons.upload.addEventListener('click', () => this.#dom.buttons.fileInput.click());
        this.#dom.buttons.fileInput.addEventListener('change', e => this.#handleFileUpload(e));
        Object.values(this.#dom.outputNav.buttons).forEach(btn => btn.addEventListener('click', () => this.#setOutputViewMode(btn.dataset.viewmode)));
        this.#dom.buttons.copyJson.addEventListener('click', (e) => this.#copyToClipboard('json', e.currentTarget));
        this.#dom.buttons.copyText.addEventListener('click', (e) => this.#copyToClipboard('text', e.currentTarget));
        this.#dom.buttons.downloadJson.addEventListener('click', () => this.#downloadFile('json'));
        this.#dom.buttons.downloadTxt.addEventListener('click', () => this.#downloadFile('text'));
        this.#dom.buttons.themeToggle.addEventListener('click', () => this.#toggleTheme());
    }
    #loadTheme() { const savedTheme = localStorage.getItem(APP_CONFIG.STORAGE_KEY_THEME) || 'light'; this.#setTheme(savedTheme); }
    #toggleTheme() { const currentTheme = this.#dom.body.dataset.theme; this.#setTheme(currentTheme === 'light' ? 'dark' : 'light'); }
    #setTheme(theme) {
        this.#dom.body.dataset.theme = theme;
        if (theme === 'dark') {
            this.#dom.buttons.themeToggle.classList.add('theme-rotated');
        } else {
            this.#dom.buttons.themeToggle.classList.remove('theme-rotated');
        }
        localStorage.setItem(APP_CONFIG.STORAGE_KEY_THEME, theme);
    }
    #setOutputViewMode(mode) {
        this.#dom.outputPane.dataset.viewmode = mode;
        Object.values(this.#dom.outputNav.buttons).forEach(n => n.classList.remove('active'));
        this.#dom.outputNav.buttons[mode].classList.add('active');
        this.#dom.outputNav.container.dataset.active = mode;
    }
    #handleFileUpload(e) { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = (ev) => { this.#dom.inputs.json_import.value = ev.target.result; this.#app.importJson(ev.target.result); }; r.onerror = () => this.showToast('Error reading file.', 'error'); r.readAsText(f); e.target.value = null; }
    async #copyToClipboard(type, button) {
        const state = this.#app.getState();
        const textToCopy = type === 'json' ? state.cleanJSON : state.cleanText;
        const checkmarkIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        try {
            await navigator.clipboard.writeText(textToCopy);
            this.showToast(`${type.toUpperCase()} copied to clipboard.`, 'success');
            if (button) { const original = button.innerHTML; button.innerHTML = checkmarkIcon; button.disabled = true; setTimeout(() => { button.innerHTML = original; button.disabled = false; }, 1500); }
        } catch { this.showToast('Failed to copy.', 'error'); }
    }
    #downloadFile(type) {
        const state = this.#app.getState();
        const content = type === 'json' ? state.cleanJSON : state.cleanText;
        const filename = `${(state.formData.product_description || 'prompt').substring(0, 40).replace(/[^a-z0-9._-]/gi, '_')}.${type === 'json' ? 'json' : 'txt'}`;
        const blob = new Blob([content], { type: 'text/plain' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        this.showToast(`${filename} downloaded.`, 'success');
    }
    #populateSelects() { Object.entries(APP_CONFIG.SELECT_OPTIONS).forEach(([id, options]) => { if (this.#dom.inputs[id]) options.forEach(opt => this.#dom.inputs[id].add(new Option(opt, opt))); }); }
    
    #highlightJson(jsonString) {
        if (typeof jsonString !== 'string') {
            jsonString = JSON.stringify(jsonString, null, 2);
        }
        
        return this.#escapeHtml(jsonString)
            .replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*")(\s*:)?|(\b(true|false)\b)|(\bnull\b)|(-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
                (match, str, esc, colon, bool, nullVal, num) => {
                    if (str) {
                        return colon ? `<span class="json-key">${str}</span>:` : `<span class="json-string">${str}</span>`;
                    }
                    if (bool) return `<span class="json-boolean">${match}</span>`;
                    if (nullVal) return `<span class="json-null">${match}</span>`;
                    if (num) return `<span class="json-number">${match}</span>`;
                    return match;
                }
            );
    }

    #updateLineNumbers() { const lineCount = (this.#dom.template.textarea.value || '').split('\n').length; this.#dom.template.lineNumbers.innerHTML = [...Array(lineCount).keys()].map(i => `<span>${i + 1}</span>`).join(''); this.#syncScroll(); }
    #syncScroll() { this.#dom.template.lineNumbers.scrollTop = this.#dom.template.textarea.scrollTop; }
    #debounce(func, wait) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => func.apply(this, a), wait); }; }
    #escapeHtml(text) { const m = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }; return String(text).replace(/[&<>"']/g, s => m[s]); }
}