import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("MaterialPassportModule", (m) => {
  const admin = m.getAccount(0);
  const passport = m.contract("MaterialPassport", [admin]);

  return { passport };
});
