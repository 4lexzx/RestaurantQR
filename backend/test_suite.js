const http = require("http");

function get(path, headers = {}, ms = 10000) {
  return new Promise((resolve) => {
    const req = http.request({ host: "localhost", port: 4000, path, method: "GET", headers, timeout: ms }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (d) => (data += d));
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    });
    req.on("timeout", () => { req.destroy(); resolve({ status: 0, body: "T" }); });
    req.on("error", (e) => resolve({ status: 0, body: "E " + e.message }));
    req.end();
  });
}

function resumen(nombre, r, extra) {
  console.log(`${nombre} -> ${r.status} ${r.body.slice(0, extra || 80).replace(/\n/g, " ")}`);
}

(async () => {
  resumen("health", await get("/api/health"));

  const cfg1 = await get("/api/restaurantes/menugo");
  resumen("config menugo", cfg1, 220);
  const cfg2 = await get("/api/restaurantes/sushimi");
  resumen("config sushimi", cfg2, 220);

  const p1 = await get("/api/productos", { "X-MenuGo-Slug": "menugo" });
  const n1 = (() => { try { return JSON.parse(p1.body).data.length; } catch { return "?"; } })();
  console.log(`productos menugo  -> ${p1.status} count=${n1}`);

  const p2 = await get("/api/productos", { "X-MenuGo-Slug": "sushimi" });
  const n2 = (() => { try { return JSON.parse(p2.body).data.length; } catch { return "?"; } })();
  console.log(`productos sushimi -> ${p2.status} count=${n2}  (aislado, espera 0)`);

  const m1 = await get("/api/mesas", { "X-MenuGo-Slug": "menugo" });
  const t1 = (() => { try { return JSON.parse(m1.body).total; } catch { return "?"; } })();
  console.log(`mesas menugo  -> ${m1.status} total=${t1}`);

  const m2 = await get("/api/mesas", { "X-MenuGo-Slug": "sushimi" });
  const t2 = (() => { try { return JSON.parse(m2.body).total; } catch { return "?"; } })();
  console.log(`mesas sushimi -> ${m2.status} total=${t2}`);

  const st = await get("/r/menugo/Cliente/index.html");
  console.log(`static /r/menugo/Cliente/index.html -> ${st.status} tipo=${st.body.slice(0, 40).replace(/\n/g, " ")}`);

  const st2 = await get("/Cliente/index.html");
  console.log(`static /Cliente/index.html (raiz)   -> ${st2.status}`);

  const nf = await get("/api/xyz");
  resumen("404 api/xyz", nf);
})();