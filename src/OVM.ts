interface IMethods {
  [name: string]: () => any
}

interface I$opts {
  el?: string
}

interface IOpts extends I$opts {
  state: object,
  methods?: IMethods
}

class OVM implements IOpts {
  public state: object
  public $opts: I$opts

  constructor({ state, methods, ...restOpts }: IOpts) {
    // state
    this.state = state
    OVM.observe(this.state) // 实际直接传入this可以将this.state本身也劫持
    // methods
    if (methods) {
      Object.keys(methods).forEach(methodsName => {
        this[methodsName] = methods[methodsName] // 将所有方法代理到this
      })
    }
    // compile
    this.compile(restOpts.el)
    // backup
    this.$opts = restOpts
  }

  // 数据劫持，将每一个state作为目标被观察
  private static observe(state:object): void {
    if (!state || typeof state !== 'object') return undefined;
    Object.keys(state).forEach(key => {
      const sub = new Subject() // 每个state作为一个新目标
      let val = state[key] // 实际上这里算是将val闭包，然后通过setter、getter代理和劫持
      OVM.observe(val) // 递归以处理多维对象或数组
      Object.defineProperty(state, key, {
        // 以下特性值在调用defineProperty时，默认皆为false（常规情况下为true）
        enumerable: true, // 可枚举，循环
        configurable: true, // 可配置，删除
        // writable: false,  // 可修改，赋值(该属性与get、set不能同时设置)
        // 添加setter、getter以数据劫持
        get(): any {
          // 每当该state（目标）被访问，且有相应的watcher，则将watcher（即节点）添加到观察者集合
          if (Subject.newWatcher) sub.add(Subject.newWatcher)
          return val
        },
        set(newVal: any) {
          if (val === newVal) return
          OVM.observe(newVal) // 处理赋值时，如果新值为引用类型需为他的属性添加set及get
          sub.notify(newVal) // 当该state（目标）被更新，通知所有观察该目标的观察者（节点）
          val = newVal
        }
      })
    })
  }
  
  private compile(rootId: string) {
    // 将{{}}解析并替换数据到节点
    const replace = (node: HTMLElement | DocumentFragment) => {
      node.childNodes.forEach((child: HTMLElement) => {
        // 元素节点则递归
        if (child.nodeType === 1) {
          replace(child)
        } else if (/\{\{([^}]+)\}\}/g.test(child.textContent)) {
          // 触发getter前，先通过Subject.watcher缓存观察者（因为不能在getter传参）
          Subject.newWatcher = {
            // TODO: 如何只替换旧值，而不是直接替换整个textContent
            update: (newVal: any) => {
              console.log(child, child.textContent)
              child.textContent = newVal
            }
          }
          // state属性名
          let key = RegExp.$1.trim()
          // 取出值，同时触发相应state的getter，以添加观察者（Subject.newWatcher），兼容state.a.b等深层属性
          const val = key.split('.').reduce((item, ite) => (item[ite]), this.state)
          // 清除缓存
          Subject.newWatcher = null
          // 初始化替换，注意只替换 {{}} 部分
          child.textContent = child.textContent.replace(new RegExp('\\{\\{\\s*'+ key +'\\s*\\}\\}', 'gm'), val)
        }
      })
    }
    // 使用文档碎片缓存所有节点再进行处理，节约性能
    const rootEl = document.querySelector(rootId)
    const fregment = document.createDocumentFragment()
    let child: any
    while(child = rootEl.firstChild) {
      // appendChild会将原本的节点移动到目标节点
      fregment.appendChild(child)
    }
    replace(fregment)
    // 处理完成后再将文档碎片放入实际Dom节点中
    rootEl.appendChild(fregment)
  }
}

/**
 * 观察者 -> 目标
 * 视图 -> 数据
 * node -> state
 * [TIP] 在MVVM模式下，一个数据（目标）发生改变会通知到所有观察该数据的视图(watcher)
 */

type watcher = { update: (newVal: any) => any }
// 目标类
class Subject {
  private watchers: watcher[]
  // 用于缓存新观察者
  public static newWatcher: watcher

  constructor() {
    this.watchers = []
  }

  // 添加观察者
  public add(watcher: any) {
    this.watchers.push(watcher)
  }

  // 通知更新
  public notify(newVal: any) {
    this.watchers.forEach(watcher => watcher.update(newVal))
  }
}

// 观察者类
class Watcher {
  update() {
    
  }
}
