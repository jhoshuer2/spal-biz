/** ₦ with thousands separators. Whole naira only for display. */
export const naira = (kobo: number) => "₦" + Math.round(kobo / 100).toLocaleString("en-NG");
