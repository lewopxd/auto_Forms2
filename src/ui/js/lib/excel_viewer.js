/**
 * ExcelViewer - Professional Excel-like grid viewer
 * Ported and Adapted for FormFlow
 */
class ExcelViewer {
    constructor(container, options = {}) {
        this.container = container;
        this.options = Object.assign({
            data: null,
            rowHeight: 26,
            headerHeight: 28,
            onSelection: null,
            onSheetChange: null
        }, options);

        this.state = {
            columns: [],
            rows: [],
            rawRows: [],
            sheets: [],
            activeSheet: '',
            selectedCell: null,
            selectedRow: null,
            rowNumWidth: 40
        };

        this._init();
    }

    _init() {
        this.container.innerHTML = '';
        this.container.classList.add('excel-viewer');

        this.wrapper = document.createElement('div');
        this.wrapper.className = 'ev-wrapper';

        // Formula Bar
        this.formulaBar = document.createElement('div');
        this.formulaBar.className = 'ev-formula-bar';
        this.formulaBar.innerHTML = `
            <div class="ev-cell-ref">A1</div>
            <div class="ev-cell-content"></div>
        `;
        this.cellRefEl = this.formulaBar.querySelector('.ev-cell-ref');
        this.cellContentEl = this.formulaBar.querySelector('.ev-cell-content');

        // Grid container
        this.gridContainer = document.createElement('div');
        this.gridContainer.className = 'ev-grid-container';

        // Table
        this.table = document.createElement('table');
        this.table.className = 'ev-table';
        this.thead = document.createElement('thead');
        this.tbody = document.createElement('tbody');
        this.table.appendChild(this.thead);
        this.table.appendChild(this.tbody);
        this.gridContainer.appendChild(this.table);

        // Tabs
        this.tabsBar = document.createElement('div');
        this.tabsBar.className = 'ev-tabs-bar';

        this.wrapper.appendChild(this.formulaBar);
        this.wrapper.appendChild(this.gridContainer);
        this.wrapper.appendChild(this.tabsBar);
        this.container.appendChild(this.wrapper);

        this._prepareData();
        this._render();
        this._setupEventListeners();
    }

    _prepareData() {
        if (this.options.data) {
            this._prepareDirectData();
        } else {
            this.state.columns = [];
            this.state.rows = [];
        }
        this._calculateRowNumWidth();
    }

    _prepareDirectData() {
        const data = this.options.data;
        if (!data || !data.headers || !data.data) return;

        this.state.columns = data.headers.map(h => h.name);
        this.state.rows = data.data;
        this.state.rawRows = data.data;
        this.state.sheets = data.sheets || [];
        this.state.activeSheet = data.activeSheet || '';
    }

    _calculateRowNumWidth() {
        const count = this.state.rows.length + 1;
        const width = String(count).length * 8 + 20;
        this.state.rowNumWidth = Math.max(30, width);
    }

    _render() {
        this._renderHeader();
        this._renderBody();
        // Always show tabs, even with 1 sheet
        if (this.state.sheets && this.state.sheets.length >= 1) {
            this._renderTabs();
        }
    }

    _renderHeader() {
        this.thead.innerHTML = '';
        const { columns } = this.state;

        // Letter row
        const letterRow = document.createElement('tr');
        letterRow.className = 'ev-letter-row';

        const cornerTh = document.createElement('th');
        cornerTh.className = 'ev-corner';
        cornerTh.style.width = `${this.state.rowNumWidth}px`;
        cornerTh.style.minWidth = `${this.state.rowNumWidth}px`;
        letterRow.appendChild(cornerTh);

        columns.forEach((_, i) => {
            const th = document.createElement('th');
            th.textContent = this._indexToLetter(i);
            letterRow.appendChild(th);
        });
        this.thead.appendChild(letterRow);

        // Names row
        const namesRow = document.createElement('tr');
        namesRow.className = 'ev-names-row';

        const rowNumHeader = document.createElement('th');
        rowNumHeader.className = 'ev-row-num-header ev-corner';
        rowNumHeader.textContent = '1';
        rowNumHeader.style.width = `${this.state.rowNumWidth}px`;
        rowNumHeader.style.minWidth = `${this.state.rowNumWidth}px`;
        namesRow.appendChild(rowNumHeader);

        columns.forEach((name, i) => {
            const th = document.createElement('th');
            th.className = 'ev-name-cell';
            th.textContent = name;
            th.dataset.colIndex = i;
            th.dataset.rowIndex = -1;
            namesRow.appendChild(th);
        });
        this.thead.appendChild(namesRow);
    }

    _renderBody() {
        this.tbody.innerHTML = '';
        const { rows, columns } = this.state;

        if (rows.length === 0) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = columns.length + 1;
            td.className = 'ev-empty';
            td.textContent = 'No data available';
            tr.appendChild(td);
            this.tbody.appendChild(tr);
            return;
        }

        rows.forEach((rowArray, rowIndex) => {
            const tr = document.createElement('tr');
            tr.dataset.rowIndex = rowIndex;

            const rowNumTd = document.createElement('td');
            rowNumTd.className = 'ev-row-num';
            rowNumTd.textContent = rowIndex + 2;
            rowNumTd.style.width = `${this.state.rowNumWidth}px`;
            rowNumTd.style.minWidth = `${this.state.rowNumWidth}px`;
            tr.appendChild(rowNumTd);

            columns.forEach((_, colIndex) => {
                const td = document.createElement('td');
                td.className = 'ev-cell';
                const val = rowArray[colIndex];
                td.textContent = val !== null && val !== undefined ? val : '';
                td.dataset.rowIndex = rowIndex;
                td.dataset.colIndex = colIndex;
                tr.appendChild(td);
            });
            this.tbody.appendChild(tr);
        });
    }

    _renderTabs() {
        this.tabsBar.innerHTML = '';
        const { sheets, activeSheet } = this.state;

        sheets.forEach(sheetName => {
            const tab = document.createElement('button');
            tab.className = 'ev-tab';
            tab.textContent = sheetName;

            if (sheetName === activeSheet) {
                tab.classList.add('ev-tab-active');
            }

            tab.addEventListener('click', () => {
                if (this.options.onSheetChange) {
                    this.options.onSheetChange(sheetName);
                }
            });

            this.tabsBar.appendChild(tab);
        });
    }

    _setupEventListeners() {
        this.table.addEventListener('click', (e) => {
            const cell = e.target.closest('td, th.ev-name-cell');
            if (cell && cell.dataset.rowIndex !== undefined) {
                const r = parseInt(cell.dataset.rowIndex);
                const c = parseInt(cell.dataset.colIndex);
                if (!isNaN(r) && !isNaN(c)) this._selectCell(r, c);
            }

            const rowNum = e.target.closest('.ev-row-num');
            if (rowNum) {
                const tr = rowNum.parentElement;
                const r = parseInt(tr.dataset.rowIndex);
                this._selectRow(r);
            }

            // Handle click on header row 1 (the row with column names) - this clears selection
            const headerRowNum = e.target.closest('.ev-row-num-header');
            if (headerRowNum) {
                this._selectHeaderRow();
            }
        });
    }

    _selectHeaderRow() {
        this._clearSelection();
        this.state.selectedCell = null;
        this.state.selectedRow = -1;

        // Highlight the header row
        const headerRow = this.thead.querySelector('.ev-names-row');
        if (headerRow) {
            headerRow.classList.add('ev-row-selected');
        }

        this.cellRefEl.textContent = 'Row 1';
        this.cellContentEl.textContent = 'Headers';

        // Emit selection with rowIndex -1 to indicate header row (reset state)
        this._emitSelection(-1, -1, null);
    }

    _selectCell(rowIndex, colIndex, emit = true) {
        this._clearSelection();
        this.state.selectedCell = { row: rowIndex, col: colIndex };

        const cell = this._findCell(rowIndex, colIndex);
        if (cell) {
            cell.classList.add('ev-selected');
            // Ensure visible (restore visual fix)
            cell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }

        const row = this._findRow(rowIndex);
        if (row) row.classList.add('ev-row-active');

        const colName = this.state.columns[colIndex];
        const val = rowIndex === -1 ? colName : (this.state.rows[rowIndex] ? this.state.rows[rowIndex][colIndex] : '');
        this.cellRefEl.textContent = `${this._indexToLetter(colIndex)}${rowIndex + 2}`;
        this.cellContentEl.textContent = val;

        if (emit) {
            const rowData = rowIndex >= 0 && this.state.rows[rowIndex] ? this.state.rows[rowIndex] : [];
            this._emitSelection(rowIndex, colIndex, rowData);
        }
    }

    _selectRow(rowIndex, emit = true) {
        this._clearSelection();
        this.state.selectedRow = rowIndex;

        const row = this._findRow(rowIndex);
        if (row) {
            row.classList.add('ev-row-selected');
            row.querySelector('.ev-row-num').classList.add('ev-row-num-active');
            // Ensure visible (restore visual fix)
            row.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }

        this.cellRefEl.textContent = `Row ${rowIndex + 2}`;
        this.cellContentEl.textContent = '';

        if (emit) {
            const rowData = this.state.rawRows ? this.state.rawRows[rowIndex] : [];
            this._emitSelection(rowIndex, -1, rowData);
        }
    }

    _emitSelection(rowIndex, colIndex, rowData = null) {
        if (this.options.onSelection) {
            // Defer callback so browser can paint the selection first (no lag)
            requestAnimationFrame(() => {
                this.options.onSelection({
                    rowIndex,
                    colIndex,
                    rowData: rowData || []
                });
            });
        }
    }

    _clearSelection() {
        this.table.querySelectorAll('.ev-selected').forEach(e => e.classList.remove('ev-selected'));
        this.table.querySelectorAll('.ev-row-active').forEach(e => e.classList.remove('ev-row-active'));
        this.table.querySelectorAll('.ev-row-selected').forEach(e => e.classList.remove('ev-row-selected'));
        this.table.querySelectorAll('.ev-row-num-active').forEach(e => e.classList.remove('ev-row-num-active'));
    }

    _findCell(r, c) {
        if (r === -1) return this.thead.querySelector(`th[data-col-index="${c}"]`);
        return this.tbody.querySelector(`tr[data-row-index="${r}"] td[data-col-index="${c}"]`);
    }

    _findRow(r) {
        if (r === -1) return this.thead.querySelector('.ev-names-row');
        return this.tbody.querySelector(`tr[data-row-index="${r}"]`);
    }

    _indexToLetter(i) {
        let letter = '';
        while (i >= 0) {
            letter = String.fromCharCode(65 + (i % 26)) + letter;
            i = Math.floor(i / 26) - 1;
        }
        return letter;
    }

    setData(data) {
        this.options.data = data;
        this._prepareData();
        this._render();
    }

    /**
     * Programmatically select a cell (for restore)
     */
    selectCell(rowIndex, colIndex, emit = true) {
        if (rowIndex >= 0 && colIndex >= 0) {
            this._selectCell(rowIndex, colIndex, emit);
        }
    }

    /**
     * Programmatically select a row (for restore)
     */
    selectRow(rowIndex, emit = true) {
        if (rowIndex >= 0) {
            this._selectRow(rowIndex, emit);
        }
    }
}

window.ExcelViewer = ExcelViewer;
