/**
 * 移除 expo-notifications 自動加入的 aps-environment(遠端推播)entitlement。
 * 本 app 只用本機排程通知;免費 Apple ID 簽名不支援推播 entitlement,留著會導致簽名失敗。
 */
const { withEntitlementsPlist } = require('expo/config-plugins');

module.exports = (config) => {
  // expo-notifications 會把 entitlement 寫進靜態設定,先從這裡刪
  if (config.ios?.entitlements) {
    delete config.ios.entitlements['aps-environment'];
  }
  // 再保險:寫檔階段也刪一次
  return withEntitlementsPlist(config, (c) => {
    delete c.modResults['aps-environment'];
    return c;
  });
};
