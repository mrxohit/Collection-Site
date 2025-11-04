import React, { useEffect, useMemo, useState } from "react";

// Fully mobile responsive version of Collection App
export default function App() {
  const seed = [
    { id: 1, name: "Atta (5kg)", price: 300, stock: 20, image: "" },
    { id: 2, name: "Sugar (1kg)", price: 45, stock: 50, image: "" },
    { id: 3, name: "Tea (250g)", price: 120, stock: 30, image: "" },
    { id: 4, name: "Oil (1L)", price: 180, stock: 12, image: "" },
  ];

  const [products, setProducts] = useState(() => {
    try {
      const raw = localStorage.getItem("collection_products");
      return raw ? JSON.parse(raw) : seed;
    } catch (e) {
      return seed;
    }
  });
  const [sales, setSales] = useState(() => {
    try {
      const raw = localStorage.getItem("collection_sales");
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  });
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [activePage, setActivePage] = useState("dashboard");
  const [dark, setDark] = useState(() => localStorage.getItem("collection_theme") === "dark");
  const [csvPreview, setCsvPreview] = useState("");
  const [collectionHistory, setCollectionHistory] = useState(() => {
    try {
      const raw = localStorage.getItem("collection_history");
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  });
  // keep track for scheduler cleanup
  const midnightTimers = { timeoutId: null, intervalId: null };

  useEffect(() => {
    localStorage.setItem("collection_products", JSON.stringify(products));
  }, [products]);
  useEffect(() => {
    localStorage.setItem("collection_sales", JSON.stringify(sales));
  }, [sales]);
  useEffect(() => {
    localStorage.setItem("collection_history", JSON.stringify(collectionHistory));
  }, [collectionHistory]);
  useEffect(() => {
    localStorage.setItem("collection_theme", dark ? "dark" : "light");
  }, [dark]);

  // On load: archive any past-day sales that weren't archived (catch-up)
  useEffect(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const pastDates = Array.from(new Set(sales.map(s => s.date))).filter(d => d !== todayStr).sort();
    if (pastDates.length === 0) return;
    const records = pastDates.map(date => {
      const daySales = sales.filter(s => s.date === date);
      return { date, total: daySales.reduce((sum, x) => sum + x.total, 0), sales: daySales };
    }).sort((a,b) => a.date.localeCompare(b.date));
    // prepend older records (older first)
    setCollectionHistory(prev => [...records, ...prev]);
    // keep only today's sales in sales state
    setSales(prev => prev.filter(s => s.date === todayStr));
  }, []); // run once on mount

  // scheduler: run archive at next midnight and then every 24h
  useEffect(() => {
    function archiveTodayAndReset() {
      const todayStr = new Date().toISOString().slice(0, 10);
      // compute today's sales from current sales state
      const todays = sales.filter(s => s.date === todayStr);
      if (todays.length === 0) {
        // still push an entry with zero if you want; skip if none
        setCollectionHistory(prev => [{ date: todayStr, total: 0, sales: [] }, ...prev]);
      } else {
        const total = todays.reduce((sum, s) => sum + s.total, 0);
        setCollectionHistory(prev => [{ date: todayStr, total, sales: todays }, ...prev]);
      }
      // clear sales (do not restore stock here)
      setSales([]);
    }

    // compute ms until next midnight
    const now = new Date();
    const next = new Date(now);
    next.setHours(24,0,5,0); // slight buffer (00:00:05)
    const ms = next.getTime() - now.getTime();
    // set timeout to run once at next midnight, then interval every 24h
    midnightTimers.timeoutId = setTimeout(() => {
      archiveTodayAndReset();
      midnightTimers.intervalId = setInterval(archiveTodayAndReset, 24 * 60 * 60 * 1000);
    }, ms);

    return () => {
      if (midnightTimers.timeoutId) clearTimeout(midnightTimers.timeoutId);
      if (midnightTimers.intervalId) clearInterval(midnightTimers.intervalId);
    };
  }, [sales]); // keep dependency so archive uses latest sales when fired

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let arr = products.filter((p) => p.name.toLowerCase().includes(q));
    if (sortBy === "name") arr.sort((a, b) => a.name.localeCompare(b.name));
    if (sortBy === "stock") arr.sort((a, b) => b.stock - a.stock);
    if (sortBy === "price") arr.sort((a, b) => b.price - a.price);
    return arr;
  }, [products, query, sortBy]);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const todaysSales = useMemo(() => sales.filter((s) => s.date === today), [sales, today]);
  const todaysCollection = useMemo(() => todaysSales.reduce((sum, s) => sum + s.total, 0), [todaysSales]);

  function recordSale(productId, qty) {
    const prod = products.find((p) => p.id === productId);
    if (!prod) return;
    qty = Number(qty);
    if (!qty || qty <= 0) return alert("Quantity sahi daalo");
    if (prod.stock < qty) return alert("Stock kam hai");

    const total = prod.price * qty;
    const sale = { id: Date.now(), productId, name: prod.name, qty, price: prod.price, total, date: today, time: new Date().toLocaleTimeString() };
    setSales((s) => [sale, ...s]);
    setProducts((list) => list.map((p) => (p.id === productId ? { ...p, stock: p.stock - qty } : p)));
  }

  function addProduct(name, price, stock, imageData) {
    const id = Date.now();
    setProducts((p) => [...p, { id, name, price: Number(price), stock: Number(stock), image: imageData || "" }]);
  }

  function restock(productId, qty) {
    setProducts((list) => list.map((p) => (p.id === productId ? { ...p, stock: p.stock + Number(qty) } : p)));
  }

  function exportCsv(preview = false) {
    let rows = [["Date", "Time", "Product", "Qty", "Price", "Total"]];
    for (const s of sales) rows.push([s.date, s.time, s.name, s.qty, s.price, s.total]);
    const csv = rows.map((r) => r.map(String).map((c) => '"' + c.replace(/"/g, '""') + '"').join(",")).join("\n");
    if (preview) {
      setCsvPreview(csv);
      return;
    }
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `collection_sales_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function Nav() {
    return (
      <header className="flex flex-wrap items-center justify-between w-full p-4 border-b dark:border-gray-700 gap-3">
        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-teal-500 to-blue-700   flex items-center justify-center text-white font-bold">C</div>
          <div>
            <div className="font-semibold text-lg">Collection</div>
            <div className="text-xs text-gray-400">Shopkeeper dashboard</div>
          </div>
          <button onClick={() => setDark((d) => !d)} className="sm:hidden px-3 py-1 border rounded-md text-sm">{dark ? "Light" : "Dark"}</button>
        </div>

        <div className="flex flex-wrap justify-center sm:justify-end items-center gap-2 w-full sm:w-auto">
          {['dashboard', 'products', 'sales', 'history', 'about'].map(p => (
             <button key={p} onClick={() => setActivePage(p)} className={`text-sm px-3 py-2 rounded-md ${activePage===p?'bg-blue-600 text-white':'bg-slate-700/20 hover:bg-slate-700/30'}`}>{p[0].toUpperCase()+p.slice(1)}</button>
           ))}
           <div className="hidden sm:block w-px h-6 bg-gray-600/40" />
           <button onClick={() => setDark((d) => !d)} className="hidden sm:block px-3 py-2 rounded-md border">{dark ? "Light" : "Dark"}</button>
         </div>
       </header>
     );
   }

  function Dashboard() {
    const [selectedProduct, setSelectedProduct] = useState(products[0]?.id || "");
    const [qty, setQty] = useState(1);

    useEffect(() => setSelectedProduct(products[0]?.id || ""), [products]);
    const [sellQty, setSellQty] = useState({});

    // helper to show numeric qty default
    function getQtyFor(id) {
      return sellQty[id] ?? 1;
    }

    // when a sale succeeds we reset the qty for that product
    function handleRecordSale(productId, q) {
      recordSale(productId, q);
      setSellQty(prev => ({ ...prev, [productId]: 1 }));
    }

    return (
      <div className="p-4 sm:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          <div className="p-4 rounded-2xl bg-white/5 dark:bg-gray-800/60 text-center sm:text-left">
            <div className="text-xs text-gray-400">Today's Collection</div>
            <div className="text-2xl font-bold">₹ {todaysCollection}</div>
            <div className="text-xs text-gray-400 mt-2">{todaysSales.length} sales today</div>
            <div className="mt-3 flex gap-2 justify-center sm:justify-start">
              <button className="px-3 py-2 rounded bg-teal-600 text-white" onClick={() => exportCsv()}>Download CSV</button>
              <button className="px-3 py-2 rounded border" onClick={() => exportCsv(true)}>Preview CSV</button>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white/5 dark:bg-gray-800/60">
            <div className="text-xs text-gray-400">Low stock</div>
            {products.filter(p => p.stock <= 5).length === 0 ? (
              <div className="mt-2 text-sm">No low stock products</div>
            ) : (
              <ul className="mt-2 space-y-2 text-sm">
                {products.filter(p => p.stock <= 5).map(p => (
                  <li key={p.id} className="flex justify-between"><span>{p.name}</span><span className="text-red-400"> {p.stock}</span></li>
                ))}
              </ul>
            )}
          </div>

          {/* Quick sell removed - per-product qty controls are available in each product card below */}
        </div>

        <div className="bg-white/3 p-4 rounded-lg overflow-x-auto">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3 gap-3">
            <h3 className="text-lg font-semibold text-center sm:text-left">Stock Overview</h3>
            <div className="flex flex-col sm:flex-row gap-2 items-center">
              <input placeholder="Search product" value={query} onChange={(e) => setQuery(e.target.value)} className="p-2 rounded bg-transparent border text-sm w-full sm:w-auto" />
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="p-2 rounded bg-transparent border text-sm w-full sm:w-auto">
                <option value="name">Sort: Name</option>
                <option value="stock">Sort: Stock (desc)</option>
                <option value="price">Sort: Price (desc)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((p) => (
              <div key={p.id} className="p-3 rounded-md bg-white/5 dark:bg-gray-800/50">
                <div className="flex  flex-row justify-between  gap-2">
                  <div>
                    <div className="font-medium text-center sm:text-left">{p.name}</div>
                    <div className={`text-sm ${dark ? 'text-yellow-300' : 'text-gray-900'} text-center sm:text-left`}>₹ {p.price}</div>
                  </div>
                  <div className="text-center sm:text-right">
                    <div className={`font-semibold ${p.stock < 10 ? 'text-red-400' : ''}`}>{p.stock}</div>
                    <div className="text-xs text-gray-400">in stock</div>
                  </div>
                </div>
                {p.image && <img src={p.image} alt={p.name} className="w-full h-32 object-cover rounded-md mt-3 border" />}
                <div className="mt-3 flex  flex-row gap-2 items-center">
                  <button onClick={() => { const q = Number(prompt('kitna restock karna hai?')); if (q > 0) restock(p.id, q); }} className="px-3 py-2 rounded border text-sm">Restock</button>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      max={p.stock}
                      value={getQtyFor(p.id)}
                      onChange={(e) => setSellQty(prev => ({ ...prev, [p.id]: Number(e.target.value) || 1 }))}
                      className="w-20 p-2 rounded bg-transparent border text-sm"
                    />
                    <button
                      onClick={() => {
                        const q = Number(getQtyFor(p.id) || 1);
                        if (q <= 0) return alert("Quantity sahi daalo");
                        if (p.stock < q) return alert("Stock kam hai");
                        handleRecordSale(p.id, q);
                      }}
                      className="px-3 py-2 rounded bg-emerald-600 text-white text-sm"
                    >
                      Sell
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  
   // Products Page with image upload + preview
  function ProductsPage() {
    const [name, setName] = useState("");
    const [price, setPrice] = useState("");
    const [stockInput, setStockInput] = useState("");
    const [imagePreview, setImagePreview] = useState("");

    function submit(e) {
      e.preventDefault();
      if (!name) return alert("Name dalo");
      addProduct(name, price || 0, stockInput || 0, imagePreview);
      setName(""); setPrice(""); setStockInput(""); setImagePreview("");
    }

    function handleImageUpload(e) {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result);
      reader.readAsDataURL(file);
    }

    return (
      <div className="p-6">
        <h2 className="text-lg font-semibold mb-4">Products</h2>
        <form onSubmit={submit} className="space-y-3 mb-6 max-w-xl">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Product name" className="w-full p-2 rounded bg-transparent border" />
          <div className="grid grid-cols-2 gap-2">
            <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Price" className="p-2 rounded bg-transparent border" />
            <input type="number" value={stockInput} onChange={(e) => setStockInput(e.target.value)} placeholder="Stock" className="p-2 rounded bg-transparent border" />
          </div>

          <div>
            <label className="block text-sm mb-1">Product Image (optional)</label>
            <input type="file" accept="image/*" onChange={handleImageUpload} className="p-2 rounded bg-transparent border" />
            {imagePreview && <div className="mt-2"><img src={imagePreview} alt="preview" className="h-24 w-24 object-cover rounded" /></div>}
          </div>

          <button className="px-4 py-2 rounded bg-blue-600 text-white">Add product</button>
        </form>

        <div className="space-y-2">
          {products.map(p => (
            <div key={p.id} className="p-3 rounded bg-white/5 flex justify-between items-center">
              <div className="flex items-center gap-3">
                {p.image ? <img src={p.image} alt={p.name} className="h-16 w-16 object-cover rounded" /> : <div className="h-16 w-16 bg-gray-600/30 rounded flex items-center justify-center">No Img</div>}
                <div>
                  <div className="font-medium">{p.name}</div>
                  <div className={`text-sm ${dark ? 'text-yellow-300' : 'text-gray-900'}`}>₹{p.price} • stock: <span className={`${p.stock < 10 ? 'text-red-400 font-semibold' : ''}`}>{p.stock}</span></div>
                </div>
              </div>

              <div className="flex gap-2">
                <button onClick={() => { if (confirm('delete product?')) setProducts(list => list.filter(x => x.id !== p.id)); }} className="px-2 py-1 rounded border">Delete</button>
                <button onClick={() => { const q = Number(prompt('kitna restock karna hai?')); if (q > 0) restock(p.id, q); }} className="px-2 py-1 rounded bg-emerald-600 text-white">Restock</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Sales page
  function SalesPage() {
    const [selectedIds, setSelectedIds] = useState([]);

    function toggleSelect(id) {
      setSelectedIds((prev) => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
    }

    function toggleSelectAll(checked) {
      setSelectedIds(checked ? sales.map(s => s.id) : []);
    }

    // remove sales and restore product stock for removed sales
    function removeSalesByIds(ids) {
      if (!ids || ids.length === 0) return;
      const toRemove = sales.filter(s => ids.includes(s.id));
      // restore stock based on removed sales
      setProducts(prev => {
        return prev.map(p => {
          const restore = toRemove.filter(r => r.productId === p.id).reduce((sum, r) => sum + r.qty, 0);
          return restore ? { ...p, stock: p.stock + restore } : p;
        });
      });
      setSales(prev => prev.filter(s => !ids.includes(s.id)));
      setSelectedIds([]);
    }

    function deleteSelected() {
      if (selectedIds.length === 0) return;
      if (!confirm(`Delete ${selectedIds.length} selected sale(s)?`)) return;
      removeSalesByIds(selectedIds);
    }

    return (
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">All Sales</h2>
          <div className="flex items-center gap-2">
            <label className="text-sm flex items-center gap-2">
              <input
                type="checkbox"
                checked={sales.length > 0 && selectedIds.length === sales.length}
                indeterminate={selectedIds.length > 0 && selectedIds.length < sales.length}
                onChange={(e) => toggleSelectAll(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm">Select all</span>
            </label>
            <button
              onClick={deleteSelected}
              disabled={selectedIds.length === 0}
              className={`px-3 py-1 rounded ${selectedIds.length === 0 ? 'opacity-50 cursor-not-allowed border' : 'border bg-red-600 text-white'}`}
            >
              Delete selected 
            </button>
          </div>
        </div>

        {sales.length === 0 ? (
          <div className="text-sm text-gray-400">No sales yet.</div>
        ) : (
          <div className="space-y-2">
            {sales.map(s => (
              <div key={s.id} className="p-3 rounded bg-white/5 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <input type="checkbox" checked={selectedIds.includes(s.id)} onChange={() => toggleSelect(s.id)} className="w-4 h-4" />
                  <div>
                    <div className="font-medium">{s.name} — {s.qty} × ₹{s.price} = ₹{s.total}</div>
                    <div className="text-xs text-gray-400">{s.date} {s.time}</div>
                  </div>
                </div>
                <div>
                  <button onClick={() => { if (!confirm('delete sale?')) return; removeSalesByIds([s.id]); }} className="px-2 py-1 rounded border">Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  function AboutPage() {
    return (
      <div className="p-6 max-w-3xl">
        <h2 className="text-lg font-semibold mb-2">About Collection</h2>
        <p className="text-sm text-gray-400 mb-4">Simple lightweight dashboard for shopkeepers to track daily collection, sales and stock. Works offline in the browser and stores data in localStorage. Use this as a starting point and connect to a backend when you want multi-device support.</p>
        <div className="text-sm"><strong>Features:</strong>
          <ul className="list-disc ml-5 mt-2 text-gray-400">
            <li>Daily collection summary</li>
            <li>Quick sell & restock</li>
            <li>Search, sort, export CSV</li>
            <li>Local persistence (localStorage)</li>
            <li>Image upload & preview for products</li>
          </ul>
        </div>
      </div>
    );
  }

  function HistoryPage() {
    return (
      <div className="p-6">
        <h2 className="text-lg font-semibold mb-4">Collection History</h2>
        {collectionHistory.length === 0 ? (
          <div className="text-sm text-gray-400">No history yet.</div>
        ) : (
          <div className="space-y-3">
            {collectionHistory.map(h => (
              <div key={h.date} className="p-3 rounded bg-white/5">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-medium">{h.date}</div>
                    <div className="text-xs text-gray-400">{(h.sales?.length) || 0} sale(s)</div>
                  </div>
                  <div className="font-semibold">₹ {h.total}</div>
                </div>
                {h.sales && h.sales.length > 0 && (
                  <details className="mt-2 text-xs">
                    <summary className="cursor-pointer text-sm text-gray-400">View sales</summary>
                    <ul className="mt-2 space-y-1">
                      {h.sales.map(s => (
                        <li key={s.id} className="flex justify-between text-xs">
                          <span>{s.time} • {s.name} ×{s.qty}</span>
                          <span>₹{s.total}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

const Pages = { dashboard: <Dashboard />,
  products: <ProductsPage />,
  sales: <SalesPage/>,
  history: <HistoryPage/>,
  about: <AboutPage/>
 };
  return (
    <div className={`min-h-screen ${dark ? 'dark bg-gray-900 text-gray-100' : 'bg-white text-gray-900'} transition-colors`}>
      <Nav />
      <main className="max-w-7xl mx-auto w-full overflow-x-hidden">
        {Pages[activePage] || <Dashboard />}
      </main>

      {/* CSV preview modal */}
      {csvPreview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-blue-500 rounded p-4 w-[90%] max-w-3xl">
            <div className="flex justify-between items-center mb-2">
              <div className="font-semibold">CSV Preview</div>
              <div className="flex gap-2">
                <button className="px-3 py-1 rounded border" onClick={() => {
                  const blob = new Blob([csvPreview], { type: "text/csv" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `collection_sales_${new Date().toISOString().slice(0, 10)}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}>Download</button>
                <button className="px-3 py-1 rounded border" onClick={() => setCsvPreview("")}>Close</button>
              </div>
            </div>
            <textarea readOnly value={csvPreview} className="w-full h-64 p-2 bg-transparent border text-xs font-mono" />
          </div>
        </div>
      )}
    </div>
  );
}
