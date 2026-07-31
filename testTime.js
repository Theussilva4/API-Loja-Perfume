function getHojeBRT() {
  const agora = new Date();
  // String da data local no Brasil (m/d/yyyy)
  const brtString = agora.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
  const dataBR = new Date(brtString);
  
  // Meia noite no Brasil (UTC+3)
  const inicioHojeBRT = new Date(Date.UTC(dataBR.getFullYear(), dataBR.getMonth(), dataBR.getDate(), 3, 0, 0));
  
  const primeiroDiaMes = new Date(Date.UTC(dataBR.getFullYear(), dataBR.getMonth(), 1, 3, 0, 0));
  
  console.log("Agora UTC:", agora.toISOString());
  console.log("BRT Local:", brtString);
  console.log("Inicio BRT Hoje (UTC):", inicioHojeBRT.toISOString());
  console.log("Inicio Mes BRT (UTC):", primeiroDiaMes.toISOString());
}
getHojeBRT();
