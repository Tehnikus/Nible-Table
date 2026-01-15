/**
  * nimbleTable - Vanilla JS filtarable table plugin with multi-column filtering, 
  * JSON data addition, on-the-fly data update and pagination. 
  * Uses modern JS Map() for instant filtering and data update and DocumentFragment() for faster rendering
  * @version v1.0
  * @homepage https://github.com/Tehnikus/Nible-Table
  * @author Igor Alexeyev <tehnikus.ua@gmail.com>
  * @license Apache-2.0
  */

/**
 * @param {Object} options Table options
 * {
 *  @param {Element}  table:       Table DOM element,
 *  @param {Object}   pagination:  { page, perPage }, if isset then pagination will be rendered in tfoot
 *  @param {Function} template:    function(rowDataObject) { returns row DOM Element },
 *  @param {String}   idField:     Key string in rowDataObject that represents unique row id number (in case you need to update data in DB by id),
 *  @param {Function} onFilterEnd: function(filteredRowsMap) { returns Map() of filtered elements },
 * }
 */
class nimbleTable {
  constructor(options) {
    // Options
    this.options = options;               
    this.table = this.options.table;
    this.pagination = this.options.pagination;

    // Inner variables
    this.rowMap = new Map();              // Main data storage
    this.order = [];                      // Rows ids in displayed order
    this.filteredOrder = [...this.order]; // Filtered rows ids
    this.rowIdCounter = 0;                // Counter to add rows that don't have numerated id
    this.filters = [];
    this.eventListenersAdded = false;     // Add event listeners only once

    // Add tbody element to table if it's not present
    if (!this.options.table.querySelector('tbody')) {
      const tbody = document.createElement('tbody');
      this.options.table.append(tbody);
    }
    // Set tbody for convenient access
    this.tbody = this.options.table.querySelector('tbody');
  }

  // Render elements
  /**
   * Render single row
   * @param {Object} rowData Object with single row data
   * @returns {Element} row element
   */
  #renderRow(rowData) {
    // Function to render each row
    const rowEl = this.options.template(rowData); 
    // Set data-id to access row data in Map() on user interaction with row HTML element
    if (!rowEl.dataset.id) { rowEl.dataset.id = rowData.id }
    return rowEl;
  }

  /**
   * Render table
   * @returns {Element} rendered tbody
   */
  #renderTable() {
    this.tbody.innerHTML = '';

    // If pagination option is set, use getPaginatedOrder() else use filteredOrder
    const order = this.pagination ? this.getPaginatedOrder() : this.filteredOrder;

    // Append all rows to DocumentFragment
    const fragment = new DocumentFragment();
    for (const id of order) {
      const row = this.rowMap.get(id);
      if (!row) continue;
      fragment.appendChild(this.#renderRow(row));
    }

    this.tbody.appendChild(fragment);
    this.#addEventListeners();

    // Рендерим футер с пагинацией
    if (this.pagination) {
      this.#renderFooter();
    }

    return this.tbody;
  }

  #renderFooter() {
    let tfoot = this.table.querySelector('tfoot');
    if (!tfoot) {
      tfoot = document.createElement('tfoot');
      this.table.appendChild(tfoot);
    }

    tfoot.innerHTML = ''; // Clear before render

    const td = document.createElement('td');
    td.colSpan = this.table.querySelector('thead')?.rows[0]?.cells.length || 1;
    td.appendChild(this.#renderPagination());

    const tr = document.createElement('tr');
    tr.appendChild(td);
    tfoot.appendChild(tr);

    this.tfoot = tfoot;
    return tfoot;
  }

  /**
   * render pagination buttons
   * @returns {Element} Pagination ul.tablePagination
   */
  #renderPagination() {
    const totalPages  = this.getTotalPages();
    const currentPage = this.pagination.page || 1;

    const ul = document.createElement('ul');
    ul.classList.add('tablePagination');

    // Previous page button
    const prevBtn = document.createElement('button');
    prevBtn.innerHTML = '&#9664;';
    prevBtn.type = 'button';
    prevBtn.disabled = currentPage === 1;
    prevBtn.addEventListener('click', e => {
      e.preventDefault();
      this.prevPage();
    });
    ul.appendChild(prevBtn);

    const addPageButton = (page) => {
      const btn = document.createElement('button');
      btn.textContent = page;
      btn.type = 'button';
      if (page === currentPage) {
        btn.disabled = true;
      }
      btn.addEventListener('click', e => {
        e.preventDefault();
        this.setPage(page);
      });
      ul.appendChild(btn);
    };

    const addEllipsis = () => {
      const span = document.createElement('span');
      span.textContent = '…';
      span.classList.add('ellipsis');
      ul.appendChild(span);
    };

    let start = Math.max(2, currentPage - 2);
    let end = Math.min(totalPages - 1, currentPage + 2);

    // First page button
    addPageButton(1);

    // Ellipsis to the left of current page
    if (start > 2) addEllipsis();

    // Pages between ellipsises
    for (let page = start; page <= end; page++) {
      addPageButton(page);
    }

    // Ellipsis to the right
    if (end < totalPages - 1) addEllipsis();

    // Last page button
    if (totalPages > 1) addPageButton(totalPages);

    // Next page button
    const nextBtn = document.createElement('button');
    nextBtn.innerHTML = '&#9654;';
    nextBtn.type = 'button';
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.addEventListener('click', e => {
      e.preventDefault();
      this.nextPage();
    });
    ul.appendChild(nextBtn);

    return ul;
  }

  /**
   * Render table header
   * Element [data-filter-mode-switch] = switch of general search mode, logic between multiple columns, can have values: "AND", "OR", "NOT", default is "AND"
   * Elements [data-search-column] = search input or select
   * @param {Element} headerElement HTML element or DOM elemnt which is considered as table header
   * @returns {Element} Header element
   */
  renderHeader(headerElement = null) {
    if (!(headerElement instanceof Element) || this.options.table.querySelector('thead')) return null;
    // Check if table header is in DOM
    if (!headerElement.parentNode) {
      // If header not in DOM (i.e. JS rendered element passed as argument) then append it to table at the very beginning
      this.options.table.prepend(headerElement);
    }

    // Add filtering event listeners
    headerElement.addEventListener('input', e => {
      if (e.target.dataset.searchColumn) {
        let filterArray = [];
        headerElement.querySelectorAll('[data-search-column]').forEach(el => {
          filterArray.push({column: el.dataset.searchColumn, value: el.value, mode: el.dataset.searchMode || ""});
        });
        this.filters = filterArray;
        this.columnsLogic = 'AND';
        this.filterTable();
      }
    });

    this.thead = headerElement;
    return headerElement;
  }

  // End render elements

  // --- Add event listeners once ---
  #addEventListeners() {
    // If event listener is already added return
    if (this.eventListenersAdded) { return false }
    // Add callback event listener
    if (this.options.addEventListeners) { this.options.addEventListeners(this.table) }

    this.tbody.addEventListener('click', e => {
      // Remove row
      const btn = e.target.closest('[data-remove-row]');
      if (btn) {
        const rowEl = btn.closest('[data-id]');
        if (rowEl) {
          this.removeRow(rowEl.dataset.id);
          // console.log(`Row deleted`)
        }
      }
    });

    this.tbody.addEventListener('input', e => {
      const targetRow = e.target.closest('[data-id]');
      const newData = {};
      targetRow.querySelectorAll('input, select, textarea').forEach(element => {
        newData[element.dataset.column] = element.value;
      });
      newData.rowType = 'updatedRow';
      targetRow.classList.add('updatedRow');
      this.updateRow(targetRow.dataset.id, newData, false);
      // console.log(`Row updated`, targetRow.dataset.id, newData)
    });

    this.eventListenersAdded = true;
    return;
  }

  /**
   * Filter rows
   * @param {Array} filters Array of objects [{column: "search_column", value: "search value", mode: "AND || OR || NOT"}, ... ]
   * @returns {Array} of rows ids that matches filter conditions
   */
  filterTable(filters) {
    // Filter order
    this.filteredOrder = this.order.filter(id => {

      const row = this.rowMap.get(id);
      if (!row) return false;

      let andConditions = [];
      let orConditions  = [];
      let notConditions = [];

      for (const { column, value, mode } of filters) {
        if (!value) continue;

        // Words logic. You can separate multiple words in one search column (or input) by commas to search multiple words in same column
        // TODO Add strict equality
        const words = String(value)
          .toLowerCase()
          .split(',')         // Split by commas
          .map(w => w.trim()) // Remove spaces
          .filter(Boolean);   // Remove empty

        // True if some word included in row's column
        const match = words.some(word =>
          String(row[column] ?? '').toLowerCase().includes(word)
        );

        // Logic between search columns or inputs
        if      (mode === 'AND') andConditions.push(match);
        else if (mode === 'OR')  orConditions.push(match);
        else if (mode === 'NOT') notConditions.push(!match);
      }

      const andOk = andConditions.length ? andConditions.every(Boolean) : true;
      const orOk  = orConditions.length  ? orConditions.some(Boolean)   : true;
      const notOk = notConditions.length ? notConditions.every(Boolean) : true;

      return andOk && orOk && notOk;
    });

    if (this.pagination) {
      this.setPage(1);
    }
    this.#renderTable(this.filteredOrder);
    
    // Filter callback function
    // Returns current filtered items Map()
    if (this.options.onFilterEnd) {
      // Add items in new Map()
      let filteredMap = new Map();
      this.filteredOrder.forEach(id => {
        filteredMap.set(id, this.rowMap.get(id));
      })
      this.options.onFilterEnd(filteredMap);
    }

    return this.filteredOrder;
  }

  /**
   * Reset filter state
   * Reset search inputs
   */
  resetFilter() {
    this.filteredOrder = [...this.order];
    this.thead.querySelectorAll('[data-search-column]').forEach(e => {
      e.value = '';
    })
    this.#renderTable();
  }

  /**
   * Add data to table
   * @param   {Array}   rows array of objects with every row data
   * @param   {Boolean} keepFilters If filter state should be kept when adding a new row
   * @returns {Element} Table element for further convenient interaction
   */
  setData(rows = [], keepFilters = false) {
    for (let i = 0; i < rows.length; i++) {
      const row = { ...rows[i] };
      let id = Number(row.id || row[this.options.idField]);

      // If no row id present then add unique one
      if (!id) {
        this.rowIdCounter++;
        id = this.rowIdCounter;
      }

      row.id = id;

      if (this.rowMap.has(id)) {
        // If row with this id already exists, then update its data only
        // Actual HTML element will be updated anyway
        this.rowMap.set(id, { ...this.rowMap.get(id), ...row });
      } else {
        // Else add new entry in rowMap Map()
        this.rowMap.set(id, row);
        // Push new id to default display order
        if (!this.order.includes(id)) { this.order.push(id) }
        // Push new id to filtered display order
        if (!this.filteredOrder.includes(id)) { this.filteredOrder.push(id) }
      }
    }

    // Keep current filtered state or not
    if (!keepFilters) { this.filteredOrder = [...this.order] }

    this.#renderTable(this.filteredOrder);

    if (this.rowMap.size) {
      this.rowIdCounter = Math.max(...this.rowMap.keys());
    } else {
      this.rowIdCounter = 0;
    }

    return this.tbody;
  }

  /**
   * Delete row from table data and remove it's element
   * @param {Number} id The id number of particular row to be deleted
   * @returns {Boolean} true if row is deleted, false if not
   */
  removeRow(id) {
    id = Number(id);
    if (!this.rowMap.has(id)) return false;
    
    this.rowMap.delete(id); // Remove row data from Map()
    this.order = this.order.filter(x => x !== id); // Remove id from general display order
    this.filteredOrder = this.filteredOrder.filter(x => x !== id); // Remove id from filtered display order

    // Remove element from DOM
    const tr = this.tbody.querySelector(`[data-id="${id}"]`);
    if (tr) tr.remove();

    return true;
  }

  /**
   * Update row data and HTML element if needed
   * Set @param updateElement to false if your element has some input. 
   * Then all changes in input will be translated to rows Map() without reloading actual element
   * Set to true if your data is loaded externally - by XHR or elswhere
   * 
   * @param {Number} id The id number of row to be updated
   * @param {Object} newData Object of new data to be set in this row
   * @param {Boolean} updateElement Update actual HTML element or not
   * @returns {Boolean} true if element updated, false if element does not exist
   */
  updateRow(id, newData, updateElement = false) {
    id = Number(id);
    if (!this.rowMap.has(id)) return false;

    const oldData = this.rowMap.get(id);
    const updatedRow = { ...oldData, ...newData, id };
    this.rowMap.set(id, updatedRow);

    if (updateElement) {
      const tr = this.tbody.querySelector(`[data-id="${id}"]`);
      if (tr) {
        const newTr = this.#renderRow(updatedRow);
        tr.replaceWith(newTr);
      }
    }

    return true;
  }

  // Get and find rows
  getRow(id) {
    id = Number(id);
    return this.rowMap.get(id) || null;
  }

  // TODO Return array of rows here instead of single row
  findRowByKey(key, value) {
    for (const row of this.rowMap.values()) {
      if (row[key] === value) return row;
    }
    return null;
  }

  // Pagination
  getPaginatedOrder() {
    const { page = 1, perPage } = this.pagination;
    const start = (page - 1) * perPage;
    return this.filteredOrder.slice(start, start + perPage);
  }

  setPage(page) {
    const total = this.getTotalPages();
    this.pagination.page = Math.max(1, Math.min(page, total));
    this.#renderTable();
  }

  nextPage() {
    this.setPage(this.pagination.page + 1);
  }

  prevPage() {
    this.setPage(this.pagination.page - 1);
  }

  getTotalPages() {
    return Math.ceil(this.filteredOrder.length / this.pagination.perPage) || 1;
  }
}




