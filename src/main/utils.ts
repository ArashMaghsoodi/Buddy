export const is = {
  dev: !process.env.NODE_ENV || process.env.NODE_ENV === 'development' || !!process.env['ELECTRON_RENDERER_URL']
}
