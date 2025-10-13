# MyTableJS
Vanilla JS filtarable table plugin with multi-column filtering, JSON data addition, on-the-fly data update and pagination. Uses modern JS Map() for instant filtering and data update and DocumentFragment() for faster rendering.
No dependencies! Around 5kb minified and even less gzipped!
## HowTo
This is quick example, more option explanation will be added later
```js
  // Table class instance
  const myTable = new MyTableJs({
    table: document.getElementById('yourTable'),
    idField:  'keyword_id',
    pagination: {perPage: 10},
    template: (row) => renderRow(row), 
    addEventListeners: (table) => {
      table.addEventListener('click', ()=> {
        console.log('Table clicked, add your custom events');
      })
    },
    onFilterEnd: (filteredMap) => {
      console.log(filteredMap);
    }
  });

  // Add Table header with filter inputs 
  const myTableHeaderElement = renderHeader(); // Render element itself, see explanation below in the next code block
  myTable.renderHeader(tableHeaderElement); // Header event listeners are be added automatically

  // Set data asyncrously by fetch
  // First get data
  const someTableData = await fetch(yourFetchUrl,  { method: 'GET' }).then(r => r.json());
  // Then set data to table
  myTable.setData(keywords);
  // That's it!
```
And some examples of renderHeader() and renderRow() functions:
Render each row function is simple template of row. Must return HTML element
If you need inputs to interactively change rows data, add [data-column="row_column_where_data_is"] attribute to input
Button to remove row must have [data-remove-row] attribute
```js
  // Render row
  // For example you have array of data rows
  // [
  //  {row_text: "This text will appear in input", row_url: "example.com"},
  //  {row_text: "Some other text will appear in input", row_url: "example2.com"},
  // ]
  // If you want to change row data right from table, you need to add [data-column="key"] attribute, that corresponds row[key] where changes will be applied
  // All cahnges will be translated automatically to rows Map(), meaning filtering will see changes in row immediatelly
  function renderRow(row) {
    const tr = document.createElement('tr'); // Return HTML Element, not string
    // Then you can write innerHTML for convenience
    tr.innerHTML = `
      <td><input data-column="row_text" name="row_text" value="${row.row_text}"></td>
      <td><p>${row.row_url}</p></td>
      <td><button data-remove-row></td>
    `;
    // And return element
    return tr;
  }
```
Render header function. This header example will filter rows and add new row 
```js
  function renderHeader() {
    const thead           = document.createElement('thead');
    thead.innerHTML = `
      <tr>
        <!-- First row filters table -->
        <th><input type="text" data-search-column="row_text" placeholder="Search text"></th>
        <th><input type="text" data-search-column="row_url"  placeholder="Search URL"></th>
        <th></th>
      </tr>
      <tr>
        <!-- Second row adds new data to the table -->
        <th><input type="text" data-search-column="row_text" placeholder="Search text"></th>
        <th><input type="text" data-search-column="row_url"  placeholder="Search URL"></th>
        <th class="text-center">
          <button type="button" class="addRow">Add new row</button>
        </th>
      </tr>
    `;

    return thead;
  }
```
Function that adds new row to the table, just a quick example compatible with header code above.
Get all inputs values, put them into object, 
```js
  myTableJs.thead.querySelector('.addRow').addEventListener('click', (e) => {
    const newRow = e.target.closest('tr');
    const newData = {};
    newRow.querySelectorAll('input, select').forEach(element => {
      newData[element.dataset.addRowColumn] = element.value || '';
    });
    newRow.rowType = 'newRow'; // This is not neccessary, but you can filter or highlight new rows by adding some data to row object.
    const table = MyTableJs.setData([newData], true); // Add row to table. This function returns table element, that can be used later, see below

    // These are not neccessary, but they scroll table to the new row
    MyTableJs.setPage(MyTableJs.getTotalPages());
    table.lastChild.scrollIntoView({block: "nearest", inline: "nearest"});
  });
```


