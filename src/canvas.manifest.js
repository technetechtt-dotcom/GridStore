export const manifest = {
  screens: {
    scr_8e2sic: { name: "Home", route: "/", position: { "x": 0, "y": 0 }, isDefaultRow: true },
    scr_mgxqb2: { name: "Marketplace", route: "/marketplace", position: { "x": 160, "y": 3800 } },
    scr_aw7gdq: { name: "Product Detail", route: "/product/1", position: { "x": 5760, "y": 3800 } },
    scr_9wdivp: { name: "Services", route: "/services", position: { "x": 1560, "y": 3800 } },
    scr_i0gs22: { name: "Rentals", route: "/rentals", position: { "x": 2960, "y": 3800 } },
    scr_dwa88g: { name: "Jobs", route: "/jobs", position: { "x": 4360, "y": 3800 } },
    scr_xpoibt: { name: "Seller Dashboard", route: "/seller", position: { "x": 160, "y": 5780 } },
    scr_eoyb60: { name: "Buyer Dashboard", route: "/dashboard", position: { "x": 160, "y": 7760 } },
    scr_f6ru9u: { name: "Storefront", route: "/store", position: { "x": 1560, "y": 5780 } },
    scr_kcvxmv: { name: "Messages", route: "/messages", position: { "x": 160, "y": 9740 } },
    scr_43dxsq: { name: "Login", route: "/login", position: { "x": 160, "y": 11720 } },
    scr_jy9ed6: { name: "Signup", route: "/signup", position: { "x": 1560, "y": 11720 } },
    scr_d30b1k: { name: "Cart", route: "/cart", position: { "x": 160, "y": 1820 } },
    scr_ds0048: { name: "Wishlist", route: "/wishlist", position: { "x": 1560, "y": 1820 } },
    scr_gjd15p: { name: "Notifications", route: "/notifications", position: { "x": 1560, "y": 7760 } },
    scr_4ucdgq: { name: "Privacy Policy", route: "/privacy", position: { "x": 160, "y": 13700 } },
    scr_tky0s0: { name: "Terms of Service", route: "/terms", position: { "x": 1560, "y": 13700 } },
    scr_1o182y: { name: "Not Found", route: "/this-route-does-not-exist", position: { "x": 1400, "y": 0 }, isDefaultRow: true }
  },
  sections: {
    sec_gam1g4: { name: "Shopping Flow", x: 0, y: 1600, width: 2920, height: 1180 },
    sec_z0e8ey: { name: "Category Browsing", x: 0, y: 3580, width: 7120, height: 1180 },
    sec_ivso5b: { name: "Seller Management", x: 0, y: 5560, width: 2920, height: 1180 },
    sec_6w5ipa: { name: "Buyer Dashboard", x: 0, y: 7540, width: 2920, height: 1180 },
    sec_s8e2us: { name: "Messaging", x: 0, y: 9520, width: 1520, height: 1180 },
    sec_p5b9qt: { name: "Authentication", x: 0, y: 11500, width: 2920, height: 1180 },
    sec_ia8whi: { name: "Legal & Meta", x: 0, y: 13480, width: 2920, height: 1180 }
  },
  layers: [
  { kind: "screen", id: "scr_8e2sic" },
  { kind: "section", id: "sec_gam1g4", children: [
    { kind: "screen", id: "scr_d30b1k" },
    { kind: "screen", id: "scr_ds0048" }]
  },
  { kind: "section", id: "sec_z0e8ey", children: [
    { kind: "screen", id: "scr_mgxqb2" },
    { kind: "screen", id: "scr_9wdivp" },
    { kind: "screen", id: "scr_i0gs22" },
    { kind: "screen", id: "scr_dwa88g" },
    { kind: "screen", id: "scr_aw7gdq" }]
  },
  { kind: "section", id: "sec_ivso5b", children: [
    { kind: "screen", id: "scr_xpoibt" },
    { kind: "screen", id: "scr_f6ru9u" }]
  },
  { kind: "section", id: "sec_6w5ipa", children: [
    { kind: "screen", id: "scr_eoyb60" },
    { kind: "screen", id: "scr_gjd15p" }]
  },
  { kind: "section", id: "sec_s8e2us", children: [
    { kind: "screen", id: "scr_kcvxmv" }]
  },
  { kind: "screen", id: "scr_1o182y" },
  { kind: "section", id: "sec_p5b9qt", children: [
    { kind: "screen", id: "scr_43dxsq" },
    { kind: "screen", id: "scr_jy9ed6" }]
  },
  { kind: "section", id: "sec_ia8whi", children: [
    { kind: "screen", id: "scr_4ucdgq" },
    { kind: "screen", id: "scr_tky0s0" }]
  }]

};