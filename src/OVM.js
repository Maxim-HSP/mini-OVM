var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var OVM = /** @class */ (function () {
    function OVM(_a) {
        var _this = this;
        var state = _a.state, methods = _a.methods, restOpts = __rest(_a, ["state", "methods"]);
        // state
        this.state = state;
        OVM.observe(this.state); // 实际直接传入this可以将this.state本身也劫持
        // methods
        if (methods) {
            Object.keys(methods).forEach(function (methodsName) {
                _this[methodsName] = methods[methodsName]; // 将所有方法代理到this
            });
        }
        // compile
        this.compile(restOpts.el);
        // backup
        this.$opts = restOpts;
    }
    // 数据劫持，将每一个state作为目标被观察
    OVM.observe = function (state) {
        if (!state || typeof state !== 'object')
            return undefined;
        Object.keys(state).forEach(function (key) {
            var sub = new Subject(); // 每个state作为一个新目标
            var val = state[key]; // 实际上这里算是将val闭包，然后通过setter、getter代理和劫持
            OVM.observe(val); // 递归以处理多维对象或数组
            Object.defineProperty(state, key, {
                // 以下特性值在调用defineProperty时，默认皆为false（常规情况下为true）
                enumerable: true,
                configurable: true,
                // writable: false,  // 可修改，赋值(该属性与get、set不能同时设置)
                // 添加setter、getter以数据劫持
                get: function () {
                    // 每当该state（目标）被访问，且有相应的watcher，则将watcher（即节点）添加到观察者集合
                    if (Subject.newWatcher)
                        sub.add(Subject.newWatcher);
                    return val;
                },
                set: function (newVal) {
                    if (val === newVal)
                        return;
                    OVM.observe(newVal); // 处理赋值时，如果新值为引用类型需为他的属性添加set及get
                    sub.notify(newVal); // 当该state（目标）被更新，通知所有观察该目标的观察者（节点）
                    val = newVal;
                }
            });
        });
    };
    OVM.prototype.compile = function (rootId) {
        var _this = this;
        // 将{{}}解析并替换数据到节点
        var replace = function (node) {
            node.childNodes.forEach(function (child) {
                // 元素节点则递归
                if (child.nodeType === 1) {
                    replace(child);
                }
                else if (/\{\{([^}]+)\}\}/g.test(child.textContent)) {
                    // 触发getter前，先通过Subject.watcher缓存观察者（因为不能在getter传参）
                    Subject.newWatcher = {
                        // TODO: 如何只替换旧值，而不是直接替换整个textContent
                        update: function (newVal) {
                            console.log(child, child.textContent, RegExp.$1);
                            child.textContent = newVal;
                        }
                    };
                    // state属性名
                    var key = RegExp.$1.trim();
                    // 取出值，同时触发相应state的getter，以添加观察者（Subject.newWatcher），兼容state.a.b等深层属性
                    var val = key.split('.').reduce(function (item, ite) { return (item[ite]); }, _this.state);
                    // 清除缓存
                    Subject.newWatcher = null;
                    // 初始化替换，注意只替换 {{}} 部分
                    child.textContent = child.textContent.replace(new RegExp('\\{\\{\\s*' + key + '\\s*\\}\\}', 'gm'), val);
                }
            });
        };
        // 使用文档碎片缓存所有节点再进行处理，节约性能
        var rootEl = document.querySelector(rootId);
        var fregment = document.createDocumentFragment();
        var child;
        while (child = rootEl.firstChild) {
            // appendChild会将原本的节点移动到目标节点
            fregment.appendChild(child);
        }
        replace(fregment);
        // 处理完成后再将文档碎片放入实际Dom节点中
        rootEl.appendChild(fregment);
    };
    return OVM;
}());
// 目标类
var Subject = /** @class */ (function () {
    function Subject() {
        this.watchers = [];
    }
    // 添加观察者
    Subject.prototype.add = function (watcher) {
        this.watchers.push(watcher);
    };
    // 通知更新
    Subject.prototype.notify = function (newVal) {
        this.watchers.forEach(function (watcher) { return watcher.update(newVal); });
    };
    return Subject;
}());
// 观察者类
var Watcher = /** @class */ (function () {
    function Watcher() {
    }
    Watcher.prototype.update = function () {
    };
    return Watcher;
}());
