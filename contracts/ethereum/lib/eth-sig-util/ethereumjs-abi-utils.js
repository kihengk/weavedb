import BN from "bn.js"
import {
  toBuffer,
  isHexPrefixed,
  zeros,
  setLengthLeft,
  setLengthRight,
} from "../ethereumjs/util"
import { stripHexPrefix } from "../ethjs-util"
import { normalize } from "./utils"

function isDynamic(type) {
  // FIXME: handle all types? I don't think anything is missing now
  return (
    type === "string" || type === "bytes" || parseTypeArray(type) === "dynamic"
  )
}

function parseTypeNxM(type) {
  const tmp = /^\D+(\d+)x(\d+)$/u.exec(type)
  return [parseInt(tmp[1], 10), parseInt(tmp[2], 10)]
}

function parseTypeN(type) {
  return parseInt(/^\D+(\d+)$/u.exec(type)[1], 10)
}

function isArray(type) {
  return type.lastIndexOf("]") === type.length - 1
}

function parseNumber(arg) {
  const type = typeof arg
  if (type === "string") {
    if (isHexPrefixed(arg)) {
      return new BN(stripHexPrefix(arg), 16)
    }
    return new BN(arg, 10)
  } else if (type === "number") {
    return new BN(arg)
  } else if (arg.toArray) {
    // assume this is a BN for the moment, replace with BN.isBN soon
    return arg
  }
  throw new Error("Argument is not a number")
}

function encodeSingle(type, arg) {
  let size, num, ret, i

  if (type === "address") {
    return encodeSingle("uint160", parseNumber(arg))
  } else if (type === "bool") {
    return encodeSingle("uint8", arg ? 1 : 0)
  } else if (type === "string") {
    return encodeSingle("bytes", Buffer.from(arg, "utf8"))
  } else if (isArray(type)) {
    // this part handles fixed-length ([2]) and variable length ([]) arrays
    // NOTE: we catch here all calls to arrays, that simplifies the rest
    if (typeof arg.length === "undefined") {
      throw new Error("Not an array?")
    }
    size = parseTypeArray(type)
    if (size !== "dynamic" && size !== 0 && arg.length > size) {
      throw new Error(`Elements exceed array size: ${size}`)
    }
    ret = []
    type = type.slice(0, type.lastIndexOf("["))
    if (typeof arg === "string") {
      arg = JSON.parse(arg)
    }

    for (i in arg) {
      if (Object.prototype.hasOwnProperty.call(arg, i)) {
        ret.push(encodeSingle(type, arg[i]))
      }
    }

    if (size === "dynamic") {
      const length = encodeSingle("uint256", arg.length)
      ret.unshift(length)
    }
    return Buffer.concat(ret)
  } else if (type === "bytes") {
    arg = Buffer.from(arg)

    ret = Buffer.concat([encodeSingle("uint256", arg.length), arg])

    if (arg.length % 32 !== 0) {
      ret = Buffer.concat([ret, zeros(32 - (arg.length % 32))])
    }

    return ret
  } else if (type.startsWith("bytes")) {
    size = parseTypeN(type)
    if (size < 1 || size > 32) {
      throw new Error(`Invalid bytes<N> width: ${size}`)
    }

    if (typeof arg === "number") {
      arg = normalize(arg)
    }
    return setLengthRight(toBuffer(arg), 32)
  } else if (type.startsWith("uint")) {
    size = parseTypeN(type)
    if (size % 8 || size < 8 || size > 256) {
      throw new Error(`Invalid uint<N> width: ${size}`)
    }

    num = parseNumber(arg)
    if (num.bitLength() > size) {
      throw new Error(
        `Supplied uint exceeds width: ${size} vs ${num.bitLength()}`
      )
    }

    if (num < 0) {
      throw new Error("Supplied uint is negative")
    }

    return num.toArrayLike(Buffer, "be", 32)
  } else if (type.startsWith("int")) {
    size = parseTypeN(type)
    if (size % 8 || size < 8 || size > 256) {
      throw new Error(`Invalid int<N> width: ${size}`)
    }

    num = parseNumber(arg)
    if (num.bitLength() > size) {
      throw new Error(
        `Supplied int exceeds width: ${size} vs ${num.bitLength()}`
      )
    }

    return num.toTwos(256).toArrayLike(Buffer, "be", 32)
  } else if (type.startsWith("ufixed")) {
    size = parseTypeNxM(type)

    num = parseNumber(arg)

    if (num < 0) {
      throw new Error("Supplied ufixed is negative")
    }

    return encodeSingle("uint256", num.mul(new BN(2).pow(new BN(size[1]))))
  } else if (type.startsWith("fixed")) {
    size = parseTypeNxM(type)

    return encodeSingle(
      "int256",
      parseNumber(arg).mul(new BN(2).pow(new BN(size[1])))
    )
  }

  throw new Error(`Unsupported or invalid type: ${type}`)
}

function elementaryName(name) {
  if (name.startsWith("int[")) {
    return `int256${name.slice(3)}`
  } else if (name === "int") {
    return "int256"
  } else if (name.startsWith("uint[")) {
    return `uint256${name.slice(4)}`
  } else if (name === "uint") {
    return "uint256"
  } else if (name.startsWith("fixed[")) {
    return `fixed128x128${name.slice(5)}`
  } else if (name === "fixed") {
    return "fixed128x128"
  } else if (name.startsWith("ufixed[")) {
    return `ufixed128x128${name.slice(6)}`
  } else if (name === "ufixed") {
    return "ufixed128x128"
  }
  return name
}

function parseTypeArray(type) {
  const tmp = type.match(/(.*)\[(.*?)\]$/u)
  if (tmp) {
    return tmp[2] === "" ? "dynamic" : parseInt(tmp[2], 10)
  }
  return null
}

export function rawEncode(types, values) {
  const output = []
  const data = []

  let headLength = 0

  types.forEach(function (type) {
    if (isArray(type)) {
      const size = parseTypeArray(type)
      // eslint-disable-next-line no-negated-condition
      if (size !== "dynamic") {
        headLength += 32 * size
      } else {
        headLength += 32
      }
    } else {
      headLength += 32
    }
  })

  for (let i = 0; i < types.length; i++) {
    const type = elementaryName(types[i])
    const value = values[i]
    const cur = encodeSingle(type, value)

    // Use the head/tail method for storing dynamic data
    if (isDynamic(type)) {
      output.push(encodeSingle("uint256", headLength))
      data.push(cur)
      headLength += cur.length
    } else {
      output.push(cur)
    }
  }

  return Buffer.concat(output.concat(data))
}
