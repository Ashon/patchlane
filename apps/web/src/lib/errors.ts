export const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message
  }

  return 'Unknown error'
}

export const getQueryErrorMessage = (...errors: Array<unknown | null>) => {
  const error = errors.find(Boolean)
  return error ? getErrorMessage(error) : null
}
