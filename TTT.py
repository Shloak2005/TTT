import random

def checkforwin(board):
    row = 1
    coloumn = 1
    state = False
    while row<18 and state == False:
        if board[row] == board[row+2] and board[row+2] == board[row+4]:
            state = True
            break
        row+=8
    while coloumn<6 and state == False:
        if board[coloumn] == board[coloumn+8] and board[coloumn+8] == board[coloumn+16]:
            state = True
            break
        coloumn += 2
    if board[1] == board[11] and board[11] == board[21]:
        state = True
    elif board[5] == board[11] and board[11] == board[17]:
        state = True
    return state


def changing_fn_y(n, filled, em, sym):
    k = filled.index(n)
    em = em[:k] + sym + em[k+1:]
    return em


def changing_fn_x(n,filled,sym):
    k = filled.index(n)
    filled = filled[:k] + sym + filled[k+1:]
    return filled


def check_repeating(num,item):
    if int(num) in item:
        return True
    else:
        return False

def make_not_repeating(num,item):
    if int(num) in item:
        item.remove(int(num))
        return item


indexes = "|0|1|2|\n|3|4|5|\n|6|7|8|"
lines = "| | | |\n| | | |\n| | | |"
print(indexes)

#Game starts from here --->
while True:
    y = lines
    x = indexes
    available_choices = [0,1, 2, 3, 4, 5, 6, 7, 8]
    p_sym = input("Choose ur symbole to play or press q to quit.------>(x/o): ").lower()
    if p_sym == "x" or p_sym == "o":
        while True:
            
            #player input ----->
            
            p = input("Please enter index: ")
            if p in x and check_repeating(p,available_choices):
               y = changing_fn_y(p,x,y,p_sym)
               x = changing_fn_x(p, x, p_sym)
               if checkforwin(x):
                   print(y)
                   print("You won!")
                   break
            else:
                print("please enter valid index. ")
                continue
            available_choices = make_not_repeating(p, available_choices)

            #computer input ------>
            
            if p_sym == "x":
                c_sym = "o"
            else:
                c_sym = "x"
            try:
                c = str(random.choice(available_choices))
                available_choices = make_not_repeating(c,available_choices)
                y = changing_fn_y(c,x,y,c_sym)
                x = changing_fn_x(c,x,c_sym)
                print(indexes)
                print('------------------------')
                print(y)
                if checkforwin(x):
                    print("computer won!")
                    break
            except IndexError:
                print("Its a Draw.")
                break
                
                
    elif p_sym=="q":
        break
    else:
        print("Invalide symbol, please choose valid symbol.")
        continue
