import { isNil, is } from "ramda"
import { validate } from "../../../common/warp/lib/validate"
import { parse } from "../../lib/utils"
import { err } from "../../../common/warp/lib/utils"

export const linkContract = async (state, action, signer) => {
  signer ||= await validate(state, action, "linkContract")
  let { _data, data, query, new_data, path } = await parse(
    state,
    action,
    "linkContract",
    signer
  )
  const [key, address] = action.input.query
  if (isNil(key) || isNil(address)) {
    throw new ContractError(`Key or Address not specified`)
  }
  if (isNil(state.contracts)) state.contracts = {}
  state.contracts[key] = address
  return { state }
}
