import { is, includes, isNil } from "ramda"
import { utils } from "ethers"

export const validate = async (state, action, func) => {
  const {
    query,
    nonce,
    signature,
    caller,
    type = "secp256k1",
    pubKey,
  } = action.input

  if (
    !includes(type)(
      state.auth.algorithms || [
        "secp256k1",
        "secp256k1-2",
        "ed25519",
        "rsa256",
        "poseidon",
      ]
    )
  ) {
    throw new ContractError(`The wrong algorithm`)
  }
  let _caller = caller
  const EIP712Domain = [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "verifyingContract", type: "string" },
  ]

  const domain = {
    name: state.auth.name,
    version: state.auth.version,
    verifyingContract: SmartWeave.contract.id,
  }

  const message = {
    nonce,
    query: JSON.stringify({ func, query }),
  }

  const _data = {
    types: {
      EIP712Domain,
      Query: [
        { name: "query", type: "string" },
        { name: "nonce", type: "uint256" },
      ],
    },
    domain,
    primaryType: "Query",
    message,
  }

  let signer = null
  if (type === "ed25519") {
    const { isValid } = (
      await SmartWeave.contracts.viewContractState(state.contracts.dfinity, {
        function: "verify",
        data: _data,
        signature,
        signer: caller,
      })
    ).result
    if (isValid) {
      signer = caller
    } else {
      throw new ContractError(`The wrong signature`)
    }
  } else if (type === "rsa256") {
    let encoded_data = JSON.stringify(_data)
    if (typeof TextEncoder !== "undefined") {
      const enc = new TextEncoder()
      encoded_data = enc.encode(encoded_data)
    }
    const isValid = await SmartWeave.arweave.wallets.crypto.verify(
      pubKey,
      encoded_data,
      Buffer.from(signature, "hex")
    )
    if (isValid) {
      signer = caller
    } else {
      throw new ContractError(`The wrong signature`)
    }
  } else if (type == "secp256k1") {
    signer = (
      await SmartWeave.contracts.viewContractState(state.contracts.ethereum, {
        function: "verify712",
        data: _data,
        signature,
      })
    ).result.signer
  } else if (type == "secp256k1-2") {
    signer = (
      await SmartWeave.contracts.viewContractState(state.contracts.ethereum, {
        function: "verify",
        data: _data,
        signature,
      })
    ).result.signer
  } else if (type == "poseidon") {
    const { isValid } = (
      await SmartWeave.contracts.viewContractState(state.contracts.intmax, {
        function: "verify",
        data: _data,
        signature,
        pubKey,
      })
    ).result
    if (isValid) {
      signer = caller
    } else {
      throw new ContractError(`The wrong signature`)
    }
  }

  if (includes(type)(["secp256k1", "secp256k1-2", "poseidon"])) {
    if (/^0x/.test(signer)) signer = signer.toLowerCase()
    if (/^0x/.test(_caller)) _caller = _caller.toLowerCase()
  }

  let original_signer = signer
  let _signer = signer
  const link = state.auth.links[_signer]
  if (!isNil(link)) {
    let _address = is(Object, link) ? link.address : link
    let _expiry = is(Object, link) ? link.expiry || 0 : 0
    if (_expiry === 0 || SmartWeave.block.timestamp <= _expiry) {
      _signer = _address
    }
  }
  if (_signer !== _caller) throw new ContractError(`signer is not caller`)
  if ((state.nonces[original_signer] || 0) + 1 !== nonce) {
    throw new ContractError(`The wrong nonce`)
  }
  if (isNil(state.nonces[original_signer])) state.nonces[original_signer] = 0
  state.nonces[original_signer] += 1
  return _signer
}