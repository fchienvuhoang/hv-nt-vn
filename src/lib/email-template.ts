const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);

export const EMAIL_LOGO_CID = "hvntvn-academy-logo";

function tableCellHtml(value: string) {
  return escapeHtml(value).replace(/-?\d[\d.,]*[\s\u00a0\u202f]*₫/g, amount => `<strong style="font-weight:700">${amount}</strong>`).replace(/\n/g, "<br>");
}

type EmailContent = {
  label: string;
  title: string;
  paragraphs: string[];
  wide?: boolean;
  denseTables?: boolean;
  metrics?: { label: string; value: string }[];
  tables?: { title: string; columns: string[]; rows: string[][]; widths?: number[]; nowrapColumns?: number[] }[];
  note?: string;
  link?: { label: string; url: string };
};

export function brandedEmail(content: EmailContent) {
  const link = content.link && /^https?:\/\//i.test(content.link.url) ? content.link : undefined;
  const metrics = content.metrics ?? [];
  const text = ["Học viện Nguyên Thủy Việt Nam · Minh bạch thiện pháp", content.label, content.title, ...content.paragraphs, ...metrics.map(metric => `${metric.label}: ${metric.value}`), ...(content.tables ?? []).flatMap(table => [table.title, table.columns.join(" · "), ...table.rows.map(row => row.join(" | "))]), content.note, link ? `${link.label}: ${link.url}` : undefined].filter(Boolean).join("\n\n");
  const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(content.title)}</title><style>
@media screen and (min-width:641px) { .report-table .cell-compact { white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important; } }
@media screen and (max-width:640px) {
 .email-outer { padding:8px 4px!important; } .email-content { padding:12px!important; }
 .report-table { width:100%!important;table-layout:auto!important; }
 .report-table thead { display:none!important; }
 .report-table tbody { display:block!important;width:100%!important; }
 .report-table tr { display:block!important;padding:7px 0!important;border-bottom:1px solid #eadfd4!important;font-size:0!important; }
 .report-table td { display:inline-block!important;box-sizing:border-box!important;width:50%!important;padding:3px 5px!important;border:0!important;vertical-align:top!important;white-space:normal!important;overflow:visible!important;text-overflow:clip!important;font-size:14px!important;line-height:1.35!important;word-break:normal!important;overflow-wrap:anywhere!important; }
 .report-table td:first-child,.report-table td.cell-long { display:block!important;width:100%!important; }
 .report-table td.cell-name { font-size:15px!important;font-weight:bold!important;color:#7b3040!important; }
 .report-table .cell-label { display:block!important;font-size:11px!important;line-height:1.25!important;color:#87766a!important;font-weight:normal!important;margin-bottom:2px!important; }
 .report-table .cell-name .cell-label { display:none!important; }
}
</style></head>
<body style="margin:0;padding:0;background:#faf6f0;color:#412c2b;font-family:'Be Vietnam Pro','Segoe UI',Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf6f0"><tr><td class="email-outer" align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:${content.wide ? "1000" : "600"}px;background:#ffffff;border:1px solid #eadfd4;border-radius:14px;overflow:hidden">
<tr><td style="padding:12px 20px;border-top:4px solid #7b3040;border-bottom:1px solid #eadfd4"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td width="64" style="vertical-align:middle"><img src="cid:${EMAIL_LOGO_CID}" width="52" height="52" alt="Logo Học viện Nguyên Thủy Việt Nam" style="display:block;width:52px;height:52px;border:0"></td>
<td style="vertical-align:middle"><strong style="font-size:16px;line-height:1.2;color:#7b3040">Học viện nguyên thủy Việt Nam</strong><br><span style="font-size:12px;line-height:1.2;color:#87766a">Minh bạch thiện pháp</span></td>
</tr></table></td></tr>
<tr><td class="email-content" style="padding:14px 20px"><span style="font-size:11px;font-weight:bold;letter-spacing:1px;color:#7b3040;background:#f5f0ec;padding:6px 10px;border-radius:5px">${escapeHtml(content.label)}</span>
<h1 style="font-size:23px;line-height:1.2;color:#412c2b;margin:10px 0 8px">${escapeHtml(content.title)}</h1>
${content.paragraphs.map(paragraph => `<p style="font-size:14px;line-height:1.35;margin:0 0 4px">${escapeHtml(paragraph)}</p>`).join("")}
${metrics.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;background:#faf6f0;border:1px solid #eadfd4;border-radius:8px">${metrics.map((metric, index) => `<tr><td style="padding:${index === 0 ? "16px 16px 10px" : "0 16px 14px"}"><span style="font-size:12px;color:#87766a">${escapeHtml(metric.label)}</span><br><strong style="font-size:${index === 0 ? "28" : "18"}px;line-height:1.5;color:${index === 0 ? "#7b3040" : "#412c2b"}">${escapeHtml(metric.value)}</strong></td></tr>`).join("")}</table>` : ""}
${(content.tables ?? []).map(table => `<h2 style="font-size:17px;line-height:1.5;color:#7b3040;margin:24px 0 10px">${escapeHtml(table.title)}</h2><table class="report-table" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:${content.denseTables ? "14" : "12"}px;line-height:${content.denseTables ? "1.25" : "1.5"};table-layout:fixed"><thead><tr>${table.columns.map((column, index) => `<th scope="col" style="${table.widths?.[index] ? `width:${table.widths[index]}%;` : ""}padding:${content.denseTables ? "5px" : "6px"} 5px;background:#f5f0ec;border:1px solid #eadfd4;text-align:left;color:#7b3040;overflow-wrap:anywhere">${escapeHtml(column)}</th>`).join("")}</tr></thead><tbody>${table.rows.map(row => `<tr>${row.map((cell, index) => `<td class="${table.nowrapColumns?.includes(index) ? "cell-compact " : ""}${index === 0 && /Thiện pháp/.test(table.columns[0]) ? "cell-name " : ""}${/Nội dung|Cú pháp|Gán vào/.test(table.columns[index]) ? "cell-long" : ""}" title="${escapeHtml(cell)}" style="padding:${content.denseTables ? "3px" : "9px"} 5px;border:1px solid #eadfd4;vertical-align:middle;white-space:normal;overflow-wrap:anywhere;word-break:normal"><span class="cell-label" style="display:none">${escapeHtml(table.columns[index])}</span>${tableCellHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`).join("")}
${link ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0"><tr><td bgcolor="#7b3040" style="border-radius:6px"><a href="${escapeHtml(link.url)}" style="display:inline-block;padding:12px 18px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold">${escapeHtml(link.label)}</a></td></tr></table>` : ""}
${content.note ? `<p style="font-size:12px;line-height:1.7;color:#87766a;margin:16px 0 0">${escapeHtml(content.note)}</p>` : ""}
</td></tr><tr><td style="padding:16px 20px;border-top:1px solid #eadfd4;background:#f5f0ec"><p style="font-size:12px;line-height:1.7;color:#87766a;margin:0">“Lấy thí thắng xan tham.”<br><span style="font-size:11px">Kinh Pháp Cú, kệ 223 · HT. Thích Minh Châu dịch</span></p></td></tr>
</table></td></tr></table></body></html>`;
  return { TextPart: text, HTMLPart: html };
}
