const Arweave = require("arweave")
const { Exm, ContractType } = require("@execution-machine/sdk")
const { readFileSync } = require("fs")
const path = require("path")
const { isNil, mergeLeft } = require("ramda")
const wallet_name = process.argv[2]
const token = process.argv[3]
const exm = new Exm({
  token,
})

const deploy = async () => {
  const wallet_path = path.resolve(
    __dirname,
    ".wallets",
    `wallet-${wallet_name}.json`
  )
  const wallet = JSON.parse(readFileSync(wallet_path, "utf8"))
  const arweave = Arweave.init()
  const walletAddress = await arweave.wallets.jwkToAddress(wallet)

  const contractSource = readFileSync(
    path.resolve(__dirname, "../dist/exm/exm.js")
  )
  let init = JSON.parse(
    readFileSync(
      path.resolve(__dirname, "../dist/exm/initial-state.json"),
      "utf8"
    )
  )
  const addr = await arweave.wallets.jwkToAddress(wallet)
  init.owner = addr
  console.log(await exm.functions.deploy(contractSource, init, ContractType.JS))
}

deploy()
