import { isNil, mergeLeft } from "ramda"
import { clone, parse, mergeData } from "../../lib/utils"
import { err } from "../../lib/utils"
import { validate } from "../../lib/validate"
import { validator } from "@exodus/schemasafe"

export const setSchema = async (state, action, signer) => {
  signer ||= await validate(state, action, "setSchema")
  let { _data, data, query, new_data, path } = await parse(
    state,
    action,
    "setSchema",
    signer
  )
  _data.schema = new_data
  const _validate = validator(clone(_data.schema))
  return { state }
}