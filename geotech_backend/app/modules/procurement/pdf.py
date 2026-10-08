"""Corporate Work Order PDF renderer (reportlab platypus).

Mirrors the live A4 preview section-for-section: company header (+logo),
WORK ORDER title, number/date meta, vendor + project blocks, subject /
reference, intro letter, BOQ table (headers repeat across pages), totals,
numbered payment terms, numbered general terms, acceptance, dual signature
blocks, footer with contact info + page numbers. Multi-page safe: rows and
terms never split, signatures never orphan.
"""
from __future__ import annotations

import os
from datetime import datetime

PDF_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.dirname(__file__)))), "generated_pdfs")


def _money(v) -> str:
    try:
        return f"{float(v or 0):,.2f}"
    except Exception:
        return "0.00"


def _para(text, style):
    from reportlab.platypus import Paragraph
    safe = (text or "-").replace("&", "&amp;").replace("\n", "<br/>")
    return Paragraph(safe, style)


def render_work_order_pdf(db, wo) -> tuple[str, bytes]:
    """Render the corporate PDF for a WorkOrder. Returns (rel_path, bytes)."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table,
                                    TableStyle, HRFlowable, KeepTogether, Image,
                                    PageBreak)
    from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_JUSTIFY

    os.makedirs(PDF_DIR, exist_ok=True)
    navy = colors.HexColor("#0f2a44")
    muted = colors.HexColor("#5b7288")

    # Structured document (snapshot-first, live fallback)
    from app.modules.procurement import service as _svc
    company = _svc._company_doc_data(db, wo)
    vendor = _svc._vendor_doc_data(db, wo)
    project = _svc._project_doc_data(db, wo)
    pay_terms = _svc._jloads(wo.payment_terms_json, []) or []
    gen_terms = _svc._jloads(wo.general_terms_json, []) or []

    ts = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    safe_no = "".join(c if c.isalnum() or c in ("-", "_", ".", "/") else "-"
                      for c in (wo.work_order_number or "WO"))
    safe_no_fs = safe_no.replace("/", "-")
    fname = f"WO-{safe_no_fs}-v{wo.version or 1}-{ts}.pdf"
    abs_path = os.path.join(PDF_DIR, fname)

    styles = getSampleStyleSheet()
    sTitle = ParagraphStyle("WOTitle", parent=styles["Heading1"], fontSize=19,
                            textColor=navy, alignment=TA_CENTER, spaceAfter=2)
    sSub = ParagraphStyle("WOSub", parent=styles["Normal"], fontSize=9,
                          textColor=muted, alignment=TA_CENTER, spaceAfter=6)
    sH = ParagraphStyle("WOH", parent=styles["Heading2"], fontSize=11.5,
                        textColor=navy, spaceBefore=10, spaceAfter=5,
                        borderPadding=(0, 0, 3, 0))
    sN = ParagraphStyle("WON", parent=styles["Normal"], fontSize=9.2, leading=13)
    sSmall = ParagraphStyle("WOS", parent=styles["Normal"], fontSize=8.2,
                            leading=11, textColor=muted)
    sCell = ParagraphStyle("WOC", parent=styles["Normal"], fontSize=8.8, leading=11.5)
    sCellH = ParagraphStyle("WOCH", parent=sCell, textColor=colors.white)
    sRight = ParagraphStyle("WOR", parent=sCell, alignment=TA_RIGHT)
    sJust = ParagraphStyle("WOJ", parent=sN, alignment=TA_JUSTIFY)
    sFoot = ParagraphStyle("WOF", parent=styles["Normal"], fontSize=7.8,
                           leading=10, textColor=muted, alignment=TA_CENTER)

    story = []

    # ---------- Company header ----------
    head_cells = []
    logo_path = None
    try:
        from app.modules.company.service import logo_abs_path
        logo_path = logo_abs_path(db)
    except Exception:
        logo_path = None
    def _logo_ok(p):
        try:
            from PIL import Image as _PILImage
            with _PILImage.open(p) as _img:
                _img.verify()
            return True
        except Exception:
            return False

    if logo_path and _logo_ok(logo_path):
        try:
            head_cells.append(Image(logo_path, width=30 * mm, height=22 * mm,
                                    kind="proportional"))
        except Exception:
            head_cells.append(Paragraph("", sN))
    elif logo_path:
        head_cells.append(Paragraph("", sN))
    else:
        head_cells.append(Paragraph(
            f"<font size=20 color='#0f2a44'><b>{(company.get('company_name') or 'Company')[:1]}</b></font>",
            ParagraphStyle("LGO", parent=sN, alignment=TA_CENTER)))
    cname = company.get("company_name") or "Company Name"
    tag = company.get("tagline") or ""
    addr_bits = [company.get("address_line1"), company.get("address_line2"),
                 ", ".join(x for x in [company.get("city"), company.get("state"),
                                       company.get("pin")] if x)]
    addr = ", ".join(x for x in addr_bits if x)
    contact_bits = [x for x in [company.get("phone"), company.get("email"),
                                company.get("website")] if x]
    head_cells.append(Paragraph(
        f"<font size=15 color='#0f2a44'><b>{cname}</b></font>"
        + (f"<br/><font size=9 color='#5b7288'>{tag}</font>" if tag else "")
        + (f"<br/><font size=8 color='#5b7288'>{addr}</font>" if addr else "")
        + (f"<br/><font size=8 color='#5b7288'>{' | '.join(contact_bits)}</font>"
           if contact_bits else ""), sN))
    gst_bits = [x for x in [f"GSTIN: {company.get('gstin')}" if company.get("gstin") else "",
                            f"PAN: {company.get('pan')}" if company.get("pan") else ""] if x]
    head_cells.append(Paragraph("<br/>".join(gst_bits) or "", sSmall))
    story.append(Table([head_cells], colWidths=[36 * mm, 108 * mm, 32 * mm],
                       style=TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE")])))
    story.append(HRFlowable(width="100%", thickness=1.4, color=navy, spaceAfter=6))

    # ---------- Title + meta ----------
    story.append(Paragraph("WORK ORDER", sTitle))
    story.append(Paragraph(
        f"WO No: <b>{wo.work_order_number}</b> &nbsp;|&nbsp; "
        f"Date: <b>{wo.work_order_date or ''}</b> &nbsp;|&nbsp; "
        f"Version: <b>{wo.version or 1}</b>", sSub))
    story.append(HRFlowable(width="100%", thickness=0.6, color=muted, spaceAfter=4))

    meta = [
        [Paragraph(f"<b>Project:</b> {project.get('name') or '-'}", sCell),
         Paragraph(f"<b>Project ID:</b> {project.get('project_code') or '-'}", sCell)],
        [Paragraph(f"<b>Client:</b> {project.get('client_name') or '-'}", sCell),
         Paragraph(f"<b>Location:</b> {project.get('location') or '-'} "
                   f"{('(' + (wo.site or '') + ')') if wo.site else ''}", sCell)],
        [Paragraph(f"<b>Work Type:</b> {wo.work_type or '-'}", sCell),
         Paragraph(f"<b>Period:</b> {wo.start_date or ''} to {wo.end_date or ''}", sCell)],
    ]
    story.append(Table(meta, colWidths=[88 * mm, 88 * mm],
                       style=TableStyle([
                           ("BOX", (0, 0), (-1, -1), 0.6, navy),
                           ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.grey),
                           ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eef3f9")),
                           ("VALIGN", (0, 0), (-1, -1), "TOP"),
                           ("LEFTPADDING", (0, 0), (-1, -1), 6),
                           ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                           ("TOPPADDING", (0, 0), (-1, -1), 4),
                           ("BOTTOMPADDING", (0, 0), (-1, -1), 4)])))

    # ---------- Vendor block ----------
    story.append(Paragraph("Vendor / Contractor", sH))
    v_lines = [f"<b>{vendor.get('company') or '-'}</b>"]
    if vendor.get("vendor_code"):
        v_lines.append(f"Vendor ID: {vendor.get('vendor_code')}")
    v_addr = ", ".join(x for x in [vendor.get("address"), vendor.get("city"),
                                   vendor.get("state"), vendor.get("pin")] if x)
    if v_addr:
        v_lines.append(v_addr)
    contact = ", ".join(x for x in [
        f"{vendor.get('contact_person')}" if vendor.get("contact_person") else "",
        f"Mob: {vendor.get('mobile')}" if vendor.get("mobile") else "",
        f"{vendor.get('email')}" if vendor.get("email") else ""] if x)
    if contact:
        v_lines.append(contact)
    reg = ", ".join(x for x in [
        f"GSTIN: {vendor.get('gstin')}" if vendor.get("gstin") else "",
        f"PAN: {vendor.get('pan')}" if vendor.get("pan") else ""] if x)
    if reg:
        v_lines.append(reg)
    story.append(Table([[Paragraph("<br/>".join(v_lines), sCell)]],
                       colWidths=[176 * mm],
                       style=TableStyle([
                           ("BOX", (0, 0), (-1, -1), 0.6, navy),
                           ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f7fafd")),
                           ("LEFTPADDING", (0, 0), (-1, -1), 8),
                           ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                           ("TOPPADDING", (0, 0), (-1, -1), 6),
                           ("BOTTOMPADDING", (0, 0), (-1, -1), 6)])))

    # ---------- Subject / reference / intro ----------
    if wo.subject:
        story.append(Paragraph("Subject", sH))
        story.append(Paragraph(f"<b>{wo.subject}</b>", sN))
    if wo.reference:
        story.append(Paragraph(f"<b>Reference:</b> {wo.reference}", sN))
    intro = wo.intro_text or (
        "Dear Sir,\n\nWe are pleased to award the above said work to you. "
        "The scope, rates and terms & conditions are mentioned below.")
    story.append(Paragraph("Introduction", sH))
    story.append(_para(intro, sJust))
    if wo.scope_of_work:
        story.append(Paragraph("Scope of Work", sH))
        story.append(_para(wo.scope_of_work, sJust))

    # ---------- BOQ (headers repeat on every page) ----------
    story.append(Paragraph("Bill of Quantities", sH))
    items = list(wo.items or [])
    header = [Paragraph("<b>S.No.</b>", sCellH), Paragraph("<b>Description</b>", sCellH),
              Paragraph("<b>Qty</b>", sCellH), Paragraph("<b>Unit</b>", sCellH),
              Paragraph("<b>Rate</b>", sCellH), Paragraph("<b>Amount</b>", sCellH)]
    rows = [header]
    for it in items:
        desc = it.description or ""
        if it.sub_description:
            desc += f"<br/><font color='#5b7288' size=8>Note: {it.sub_description}</font>"
        rows.append([
            Paragraph(str(it.item_number or ""), sCell),
            Paragraph(desc, sCell),
            Paragraph(_money(it.quantity), sRight),
            Paragraph(str(it.unit or ""), sCell),
            Paragraph(_money(it.unit_rate), sRight),
            Paragraph(_money(it.line_total), sRight),
        ])
    if not items:
        rows.append([Paragraph("-", sCell), Paragraph("No items", sCell),
                     Paragraph("-", sCell), Paragraph("-", sCell),
                     Paragraph("-", sCell), Paragraph("-", sCell)])
    t = Table(rows, colWidths=[13 * mm, 71 * mm, 20 * mm, 20 * mm, 26 * mm, 26 * mm],
              repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), navy),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.grey),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("ALIGN", (2, 1), (2, -1), "RIGHT"),
        ("ALIGN", (4, 1), (-1, -1), "RIGHT"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f4f7fb")]),
    ]))
    story.append(t)
    story.append(Spacer(1, 4))
    totals = [
        [Paragraph("Subtotal", sCell), Paragraph(_money(wo.subtotal), sRight)],
        [Paragraph("Discount", sCell), Paragraph(_money(wo.discount), sRight)],
        [Paragraph(f"Tax / GST", sCell), Paragraph(_money(wo.tax_amount), sRight)],
        [Paragraph("Other charges", sCell), Paragraph(_money(wo.other_charges), sRight)],
        [Paragraph(f"<b>Grand Total ({wo.currency or 'INR'})</b>", sCell),
         Paragraph(f"<b>{_money(wo.grand_total)}</b>", sRight)],
    ]
    tt = Table(totals, colWidths=[126 * mm, 50 * mm])
    tt.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.4, colors.grey),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#e8eef4")),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(KeepTogether(tt))

    # ---------- Numbered terms ----------
    def numbered(title, terms):
        if not terms:
            return
        story.append(Paragraph(title, sH))
        for i, term in enumerate(terms, start=1):
            story.append(KeepTogether(
                Paragraph(f"<b>{i}.</b>&nbsp;&nbsp;{term}", sJust)))

    numbered("Payment Terms", pay_terms)
    if wo.payment_terms and not pay_terms:
        story.append(Paragraph("Payment Terms", sH))
        story.append(_para(wo.payment_terms, sJust))
    numbered("General Terms & Conditions", gen_terms)
    if wo.standard_terms:
        story.append(Paragraph("Standard Terms", sH))
        story.append(_para(wo.standard_terms, sJust))
    if wo.custom_terms:
        story.append(Paragraph("Additional Terms", sH))
        story.append(_para(wo.custom_terms, sJust))

    # ---------- Commercial extras ----------
    extras = []
    if wo.validity_days:
        extras.append(f"Validity: {wo.validity_days} days")
    if wo.completion_period:
        extras.append(f"Completion: {wo.completion_period}")
    if wo.retention_percent is not None:
        extras.append(f"Retention: {wo.retention_percent}%")
    if wo.tax_terms:
        extras.append(f"Taxes: {wo.tax_terms}")
    if extras:
        story.append(Paragraph("Commercial Notes", sH))
        story.append(_para(" | ".join(extras), sN))

    # ---------- Acceptance ----------
    if wo.acceptance_text:
        story.append(Paragraph("Acceptance", sH))
        story.append(KeepTogether(_para(wo.acceptance_text, sJust)))

    # ---------- Dual signatures (never split) ----------
    story.append(Paragraph("Authorised Signatories", sH))
    c_sig = wo.signer_name or (company.get("company_name") or "")
    c_des = wo.signer_designation or ""
    c_signed = f"Signed: {wo.signed_at}" if wo.signed_at else "Signature: _______________"
    c_stamp = (wo.stamp_data or "COMPANY SEAL") if wo.stamped_at else "Stamp: _______________"
    v_sig = wo.vendor_signer_name or vendor.get("contact_person") or ""
    v_des = wo.vendor_signer_designation or ""
    sig = [
        [Paragraph("<b>For " + (company.get("company_name") or "Company") + "</b>", sCell),
         Paragraph("<b>For " + (vendor.get("company") or "Vendor") + "</b>", sCell)],
        [Paragraph(f"{c_sig}<br/>{c_des}<br/>{c_signed}<br/>{c_stamp}", sCell),
         Paragraph(f"{v_sig}<br/>{v_des}<br/>Signature: _______________<br/>Date: _______________", sCell)],
    ]
    story.append(KeepTogether(Table(
        sig, colWidths=[88 * mm, 88 * mm],
        style=TableStyle([
            ("BOX", (0, 0), (-1, -1), 0.6, navy),
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e8eef4")),
            ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.grey),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 10),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 22)]))))
    story.append(Spacer(1, 6))
    story.append(Paragraph(
        f"Document v{wo.version or 1} · Generated "
        f"{datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')} · "
        "Signed copies are locked; corrections require a new version.", sSmall))

    # ---------- Footer on every page ----------
    foot_bits = [x for x in [company.get("phone"), company.get("phone2"),
                             company.get("email"), company.get("website")] if x]
    foot_off = [x for x in [company.get("footer_head_office"),
                            company.get("footer_regional_office")] if x]

    def _footer(canvas, _doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(muted)
        canvas.drawCentredString(A4[0] / 2, 26,
                                 " | ".join(foot_bits)[:160] if foot_bits else "")
        if foot_off:
            canvas.setFont("Helvetica", 6.5)
            canvas.drawCentredString(A4[0] / 2, 17, foot_off[0][:170])
            if len(foot_off) > 1:
                canvas.drawCentredString(A4[0] / 2, 9, foot_off[1][:170])
        canvas.setFont("Helvetica", 7)
        canvas.drawString(14 * mm, 12,
                          f"{wo.work_order_number} · v{wo.version or 1} · {wo.status}")
        canvas.drawRightString(A4[0] - 14 * mm, 12, f"Page {_doc.page}")
        canvas.restoreState()

    doc_tpl = SimpleDocTemplate(abs_path, pagesize=A4,
                                leftMargin=14 * mm, rightMargin=14 * mm,
                                topMargin=12 * mm, bottomMargin=20 * mm,
                                title=f"Work Order {wo.work_order_number}",
                                author=company.get("company_name") or "")
    doc_tpl.build(story, onFirstPage=_footer, onLaterPages=_footer)
    with open(abs_path, "rb") as f:
        data = f.read()
    rel = os.path.join("generated_pdfs", os.path.basename(abs_path))
    return rel, data
